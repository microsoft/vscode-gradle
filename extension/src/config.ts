import * as vscode from 'vscode';
import { GradleConfig } from './proto/gradle_pb';
import { GradleProjectFolder } from './tasks/taskUtil';

type AutoDetect = 'on' | 'off';

export function getConfigIsAutoDetectionEnabled(
  gradleProjectFolder: GradleProjectFolder
): boolean {
  return (
    vscode.workspace
      .getConfiguration('gradle', gradleProjectFolder.workspaceFolder.uri)
      .get<AutoDetect>('autoDetect', 'on') === 'on'
  );
}

export function getConfigJavaHome(): string | null {
  return vscode.workspace
    .getConfiguration('java')
    .get<string | null>('home', null);
}

export function getConfigJavaImportGradleUserHome(): string | null {
  return vscode.workspace
    .getConfiguration('java')
    .get<string | null>('import.gradle.user.home', null);
}

export function getConfigJavaImportGradleJvmArguments(): string | null {
  return vscode.workspace
    .getConfiguration('java')
    .get<string | null>('import.gradle.jvmArguments', null);
}

export function getConfigJavaImportGradleWrapperEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('java')
    .get<boolean>('import.gradle.wrapper.enabled', true);
}

export function getConfigJavaImportGradleVersion(): string | null {
  return vscode.workspace
    .getConfiguration('java')
    .get<string | null>('import.gradle.version', null);
}

export function getConfigIsDebugEnabled(): boolean {
  return vscode.workspace
    .getConfiguration('gradle')
    .get<boolean>('debug', false);
}

export function getDisableConfirmations(): boolean {
  return vscode.workspace
    .getConfiguration('gradle')
    .get<boolean>('disableConfirmations', false);
}

export function getConfigFocusTaskInExplorer(): boolean {
  return vscode.workspace
    .getConfiguration('gradle')
    .get<boolean>('focusTaskInExplorer', true);
}

export function getNestedProjectsConfig(
  workspaceFolder: vscode.WorkspaceFolder
): boolean | ReadonlyArray<string> {
  return vscode.workspace
    .getConfiguration('gradle', workspaceFolder.uri)
    .get<boolean | ReadonlyArray<string>>('nestedProjects', false);
}

export type JavaDebug = {
  tasks: ReadonlyArray<string>;
};

export function getConfigJavaDebug(
  workspaceFolder: vscode.WorkspaceFolder
): JavaDebug {
  return vscode.workspace
    .getConfiguration('gradle', workspaceFolder.uri)
    .get<JavaDebug>('javaDebug', {
      tasks: ['run', 'runBoot', 'test', 'intTest', 'integration'],
    });
}

export function getGradleConfig(): GradleConfig {
  const gradleConfig = new GradleConfig();
  const gradleUserHome = getConfigJavaImportGradleUserHome();
  const gradleJvmArguments = getConfigJavaImportGradleJvmArguments();
  const gradleVersion = getConfigJavaImportGradleVersion();
  if (gradleUserHome !== null) {
    gradleConfig.setUserHome(gradleUserHome);
  }
  if (gradleJvmArguments !== null) {
    gradleConfig.setJvmArguments(gradleJvmArguments);
  }
  if (gradleVersion !== null) {
    gradleConfig.setVersion(gradleVersion);
  }
  gradleConfig.setWrapperEnabled(getConfigJavaImportGradleWrapperEnabled());
  return gradleConfig;
}
