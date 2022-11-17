// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

package com.github.badsyntax.gradle.utils;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;

public class PluginUtils {

	private static final String MESSAGE_DIGEST_ALGORITHM = "SHA-256";
	private static final String PLUGIN_JAR_PATH = "/gradle-plugin.jar";

	public static File getInitScript() {
		try {
			// handle plugin jar
			InputStream input = PluginUtils.class.getResourceAsStream(PLUGIN_JAR_PATH);
			byte[] pluginJarBytes = readFully(input);
			byte[] pluginJarDigest = getContentDigest(pluginJarBytes);
			String pluginJarName = bytesToHex(pluginJarDigest) + ".jar";
			File pluginJarFile = new File(System.getProperty("java.io.tmpdir"), pluginJarName);
			if (needReplaceContent(pluginJarFile, pluginJarDigest)) {
				Files.write(pluginJarFile.toPath(), pluginJarBytes);
			}
			// handle init script
			String pluginJarUnixPath = pluginJarFile.getAbsolutePath().replace("\\", "/");
			String initScriptContent = "initscript {\n" + "	dependencies {\n" + "		classpath files('"
					+ pluginJarUnixPath + "')\n" + "	}\n" + "}\n" + "\n" + "allprojects {\n"
					+ "	apply plugin: com.microsoft.gradle.GradlePlugin\n" + "}\n";
			byte[] initScriptBytes = initScriptContent.getBytes();
			byte[] initScriptDigest = getContentDigest(initScriptBytes);
			String initScriptName = bytesToHex(initScriptDigest) + ".gradle";
			File initScriptFile = new File(System.getProperty("java.io.tmpdir"), initScriptName);
			if (needReplaceContent(initScriptFile, initScriptDigest)) {
				Files.write(initScriptFile.toPath(), initScriptBytes);
			}
			return initScriptFile;
		} catch (IOException | NoSuchAlgorithmException e) {
			return null;
		}
	}

	// InputStream.readAllBytes is not available in Java 8, so we have this method
	// to convert InputStream to byte array
	public static byte[] readFully(InputStream input) throws IOException {
		byte[] buffer = new byte[8192];
		int bytesRead;
		ByteArrayOutputStream output = new ByteArrayOutputStream();
		while ((bytesRead = input.read(buffer)) != -1) {
			output.write(buffer, 0, bytesRead);
		}
		return output.toByteArray();
	}

	private static boolean needReplaceContent(File initScript, byte[] checksum)
			throws IOException, NoSuchAlgorithmException {
		if (!initScript.exists() || initScript.length() == 0) {
			return true;
		}

		byte[] digest = getContentDigest(Files.readAllBytes(initScript.toPath()));
		if (Arrays.equals(digest, checksum)) {
			return false;
		}
		return true;
	}

	private static byte[] getContentDigest(byte[] contentBytes) throws NoSuchAlgorithmException {
		MessageDigest md = MessageDigest.getInstance(MESSAGE_DIGEST_ALGORITHM);
		md.update(contentBytes);
		return md.digest();
	}

	private static String bytesToHex(byte[] in) {
		final StringBuilder builder = new StringBuilder();
		for (byte b : in) {
			builder.append(String.format("%02x", b));
		}
		return builder.toString();
	}
}
