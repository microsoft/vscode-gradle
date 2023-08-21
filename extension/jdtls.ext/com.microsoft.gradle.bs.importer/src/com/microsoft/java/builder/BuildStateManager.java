/*******************************************************************************
 * Copyright (c) 2023 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 2.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *     Microsoft Corporation - initial API and implementation
 *******************************************************************************/
package com.microsoft.java.builder;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ForkJoinPool;
import java.util.concurrent.ForkJoinWorkerThread;
import java.util.zip.ZipException;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.ISaveContext;
import org.eclipse.core.resources.ISaveParticipant;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.MultiStatus;
import org.eclipse.core.runtime.Platform;
import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.internal.core.util.Messages;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;

import com.microsoft.gradle.bs.importer.GradleBuildServerProjectNature;
import com.microsoft.java.builder.jdtbuilder.JavaBuilder;

public class BuildStateManager implements ISaveParticipant {
	/**
	 * The singleton manager
	 */
	private static BuildStateManager MANAGER= new BuildStateManager();

	/** should the state.dat be gzip compressed? **/
	private static final boolean SAVE_ZIPPED = !Boolean.getBoolean("org.eclipse.jdt.disable_gzip"); //$NON-NLS-1$
	/** Thread count for parallel save - if any value is set. Any value <= 1 will disable parallel save. **/
	private static final Integer SAVE_THREAD_COUNT = Integer.getInteger("org.eclipse.jdt.model_save_threads"); //$NON-NLS-1$
	/**
	 * Table from IProject to PerProjectInfo.
	 * NOTE: this object itself is used as a lock to synchronize creation/removal of per project infos
	 */
	protected Map<IProject, ProjectInfo> perProjectInfos = new HashMap<>(5);

	private BuildStateManager() {
	}

	public void startup() {
		try {
			ResourcesPlugin.getWorkspace().addSaveParticipant(JavaCore.PLUGIN_ID, this);
		} catch (CoreException e) {
			JavaLanguageServerPlugin.logException("Failed to register save participant", e);
		}
	}

	/**
	 * Returns the singleton BuildStateManager
	 */
	public final static BuildStateManager getBuildStateManager() {
		return MANAGER;
	}

	public final static boolean hasBSPNature(IProject project) {
		// TODO not only for gradle bs project, it can also be applied to other bsp projects in future.
		try {
			return project.hasNature(GradleBuildServerProjectNature.NATURE_ID);
		} catch (CoreException e) {
			// project does not exist or is not open
		}
		return false;
	}

	@Override
	public void doneSaving(ISaveContext context) {
		// do nothing
	}

	@Override
	public void prepareToSave(ISaveContext context) throws CoreException {
		// do nothing
	}

	@Override
	public void rollback(ISaveContext context) {
		// do nothing
	}

	@Override
	public void saving(ISaveContext context) throws CoreException {
		long startTime = System.currentTimeMillis();
		savingTimed(context);
		if (JavaBuilder.DEBUG) {
			long stopTime = System.currentTimeMillis();
			System.out.println("saving took " + (stopTime - startTime) + "ms:" + this.perProjectInfos.values().size()); //$NON-NLS-1$ //$NON-NLS-2$
		}
	}

	private void savingTimed(ISaveContext context) throws CoreException {
		IProject savedProject = context.getProject();
		if (savedProject != null) {
			if (!hasBSPNature(savedProject)) return; // ignore
			ProjectInfo info = getPerProjectInfo(savedProject, true /* create info */);
			saveState(info, context);
			return;
		}

		ArrayList<ProjectInfo> infos;
		synchronized (this.perProjectInfos) {
			infos = new ArrayList<>(this.perProjectInfos.values());
		}
		int parallelism = Math.max(1, SAVE_THREAD_COUNT == null ? Math.min(infos.size(), 50) : SAVE_THREAD_COUNT.intValue());
		// Never use a shared ForkJoinPool.commonPool() as it may be busy with other tasks, which might deadlock.
		// Also use a custom ForkJoinWorkerThreadFactory, to prevent issues with a
		// potential SecurityManager, since the threads created by it get no permissions.
		// See related problem in eclipse-platform https://github.com/eclipse-platform/eclipse.platform/issues/294
		ForkJoinPool forkJoinPool = new ForkJoinPool(parallelism, //
				pool -> new ForkJoinWorkerThread(pool) {
					// anonymous subclass to access protected constructor
				}, null, false);
		IStatus[] stats;
		try {
			stats = forkJoinPool.submit(() -> infos.stream().parallel().map(info -> {
				try {
					saveState(info, context);
				} catch (CoreException e) {
					return e.getStatus();
				}
				return null;
			}).filter(Objects::nonNull).toArray(IStatus[]::new)).get();
		} catch (InterruptedException | ExecutionException e) {
			throw new CoreException(Status.error(Messages.build_cannotSaveStates, e));
		} finally {
			forkJoinPool.shutdown();
		}
		if (stats.length > 0) {
			throw new CoreException(new MultiStatus(JavaCore.PLUGIN_ID, IStatus.ERROR, stats, Messages.build_cannotSaveStates, null));
		}
	}

	/**
	 * Returns the last built state for the given project, or null if there is none.
	 * Deserializes the state if necessary.
	 *
	 * For use by image builder and evaluation support only
	 */
	public Object getLastBuiltState(IProject project, IProgressMonitor monitor) {
		if (!hasBSPNature(project)) {
			if (JavaBuilder.DEBUG)
				System.out.println(project + " is not a BSP Java project"); //$NON-NLS-1$
			return null; // should never be requested on non-Java projects
		}
		ProjectInfo info = getPerProjectInfo(project, true/*create if missing*/);
		if (!info.triedRead) {
			info.triedRead = true;
			try {
				if (monitor != null)
					monitor.subTask(Messages.bind(Messages.build_readStateProgress, project.getName()));
				info.savedState = readState(project);
			} catch (CoreException e) {
				JavaLanguageServerPlugin.logException("Exception while reading last build state for: " + project, e); //$NON-NLS-1$
			}
		}
		return info.savedState;
	}

	/**
	 * Sets the last built state for the given project, or null to reset it.
	 */
	public void setLastBuiltState(IProject project, Object state) {
		if (hasBSPNature(project)) {
			// should never be requested on non-Java projects
			ProjectInfo info = getPerProjectInfo(project, true /*create if missing*/);
			info.triedRead = true; // no point trying to re-read once using setter
			info.savedState = state;
		}
		if (state == null) { // delete state file to ensure a full build happens if the workspace crashes
			try {
				File file = getSerializationFile(project);
				if (file != null && file.exists())
					file.delete();
			} catch(SecurityException se) {
				// could not delete file: cannot do much more
			}
		}
	}

	/*
	 * Returns the per-project info for the given project. If specified, create the info if the info doesn't exist.
	 */
	public ProjectInfo getPerProjectInfo(IProject project, boolean create) {
		synchronized(this.perProjectInfos) { // use the perProjectInfo collection as its own lock
			ProjectInfo info= this.perProjectInfos.get(project);
			if (info == null && create) {
				info= new ProjectInfo(project);
				this.perProjectInfos.put(project, info);
			}
			return info;
		}
	}

	private void saveState(ProjectInfo info, ISaveContext context) throws CoreException {
		// passed this point, save actions are non trivial
		if (context.getKind() == ISaveContext.SNAPSHOT) return;

		// save built state
		if (info.triedRead) {
			long startTime = System.currentTimeMillis();
			saveBuiltState(info);
			if (JavaBuilder.DEBUG) {
				long stopTime = System.currentTimeMillis();
				System.out.println("saveState took " + (stopTime - startTime) + "ms:" + info.project.getName()); //$NON-NLS-1$ //$NON-NLS-2$
			}
		}
	}

	/**
	 * Reads the build state for the relevant project.
	 */
	protected Object readState(IProject project) throws CoreException {
		long startTime = System.currentTimeMillis();
		Object result = readStateTimed(project);
		if (JavaBuilder.DEBUG) {
			long stopTime = System.currentTimeMillis();
			System.out.println("readState took " + (stopTime - startTime) + "ms:" + project.getName()); //$NON-NLS-1$ //$NON-NLS-2$
		}
		return result;
	}

	/**
	 * Saves the built state for the project.
	 */
	private void saveBuiltState(ProjectInfo info) throws CoreException {
		if (JavaBuilder.DEBUG)
			System.out.println(Messages.bind(Messages.build_saveStateProgress, info.project.getName()));
		File file = getSerializationFile(info.project);
		if (file == null) return;
		long t = System.currentTimeMillis();
		try {
			try (DataOutputStream out = new DataOutputStream(createOutputStream(file))) {
				out.writeUTF(JavaCore.PLUGIN_ID);
				out.writeUTF("STATE"); //$NON-NLS-1$
				if (info.savedState == null) {
					out.writeBoolean(false);
				} else {
					out.writeBoolean(true);
					JavaBuilder.writeState(info.savedState, out);
				}
			}
		} catch (RuntimeException | IOException e) {
			try {
				file.delete();
			} catch(SecurityException se) {
				// could not delete file: cannot do much more
			}
			throw new CoreException(
				new Status(IStatus.ERROR, JavaCore.PLUGIN_ID, Platform.PLUGIN_ERROR,
					Messages.bind(Messages.build_cannotSaveState, info.project.getName()), e));
		}
		if (JavaBuilder.DEBUG) {
			t = System.currentTimeMillis() - t;
			System.out.println(Messages.bind(Messages.build_saveStateComplete, String.valueOf(t)));
		}
	}

	private OutputStream createOutputStream(File file) throws IOException {
		if (SAVE_ZIPPED) {
			return new BufferedOutputStream(new java.util.zip.GZIPOutputStream(new FileOutputStream(file), 8192));
		} else {
			return new BufferedOutputStream(new FileOutputStream(file));
		}
	}

	/**
	 * Returns the File to use for saving and restoring the last built state for the given project.
	 */
	private File getSerializationFile(IProject project) {
		if (!project.exists()) return null;
		IPath workingLocation = project.getWorkingLocation(JavaCore.PLUGIN_ID);
		return workingLocation.append("buildstate.dat").toFile(); //$NON-NLS-1$
	}

		private Object readStateTimed(IProject project) throws CoreException {
		File file = getSerializationFile(project);
		if (file != null && file.exists()) {
			try (DataInputStream in = new DataInputStream(createInputStream(file))) {
				String pluginID = in.readUTF();
				if (!pluginID.equals(JavaCore.PLUGIN_ID))
					throw new IOException(Messages.build_wrongFileFormat);
				String kind = in.readUTF();
				if (!kind.equals("STATE")) //$NON-NLS-1$
					throw new IOException(Messages.build_wrongFileFormat);
				if (in.readBoolean())
					return JavaBuilder.readState(project, in);
				if (JavaBuilder.DEBUG)
					System.out.println("Saved state thinks last build failed for " + project.getName()); //$NON-NLS-1$
			} catch (Exception e) {
				e.printStackTrace();
				throw new CoreException(new Status(IStatus.ERROR, JavaCore.PLUGIN_ID, Platform.PLUGIN_ERROR, "Error reading last build state for project "+ project.getName(), e)); //$NON-NLS-1$
			}
		} else if (JavaBuilder.DEBUG) {
			if (file == null)
				System.out.println("Project does not exist: " + project); //$NON-NLS-1$
			else
				System.out.println("Build state file " + file.getPath() + " does not exist"); //$NON-NLS-1$ //$NON-NLS-2$
		}
		return null;
	}

	private InputStream createInputStream(File file) throws IOException {
		InputStream in = new FileInputStream(file);
		try {
			return new BufferedInputStream(new java.util.zip.GZIPInputStream(in, 8192));
		} catch (ZipException e) {
			// probably not zipped (old format), but may also be corrupted.
			in.close();
			boolean isZip;
			try (DataInputStream din = new DataInputStream(new BufferedInputStream(new FileInputStream(file)))) {
				isZip = din.readShort() == (short) java.util.zip.GZIPInputStream.GZIP_MAGIC;
			}
			if (isZip) {
				throw e; // corrupted
			}
			return new BufferedInputStream(new FileInputStream(file));
		}
	}

	public static class ProjectInfo {
		public IProject project;
		public Object savedState = null;
		public boolean triedRead = false;

		public ProjectInfo(IProject project) {
			this.project = project;
		}
	}
}
