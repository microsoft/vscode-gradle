// package: gradletasks
// file: java-gradle-tasks/src/main/proto/gradle_tasks.proto

import * as jspb from "google-protobuf";

export class GetTasksRequest extends jspb.Message {
  getSourceDir(): string;
  setSourceDir(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetTasksRequest.AsObject;
  static toObject(includeInstance: boolean, msg: GetTasksRequest): GetTasksRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetTasksRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetTasksRequest;
  static deserializeBinaryFromReader(message: GetTasksRequest, reader: jspb.BinaryReader): GetTasksRequest;
}

export namespace GetTasksRequest {
  export type AsObject = {
    sourceDir: string,
  }
}

export class GetTasksReply extends jspb.Message {
  hasGetTasksResult(): boolean;
  clearGetTasksResult(): void;
  getGetTasksResult(): GetTasksResult | undefined;
  setGetTasksResult(value?: GetTasksResult): void;

  hasProgress(): boolean;
  clearProgress(): void;
  getProgress(): Progress | undefined;
  setProgress(value?: Progress): void;

  hasOutput(): boolean;
  clearOutput(): void;
  getOutput(): Output | undefined;
  setOutput(value?: Output): void;

  getKindCase(): GetTasksReply.KindCase;
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetTasksReply.AsObject;
  static toObject(includeInstance: boolean, msg: GetTasksReply): GetTasksReply.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetTasksReply, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetTasksReply;
  static deserializeBinaryFromReader(message: GetTasksReply, reader: jspb.BinaryReader): GetTasksReply;
}

export namespace GetTasksReply {
  export type AsObject = {
    getTasksResult?: GetTasksResult.AsObject,
    progress?: Progress.AsObject,
    output?: Output.AsObject,
  }

  export enum KindCase {
    KIND_NOT_SET = 0,
    GET_TASKS_RESULT = 1,
    PROGRESS = 2,
    OUTPUT = 3,
  }
}

export class GetTasksResult extends jspb.Message {
  getMessage(): string;
  setMessage(value: string): void;

  clearTasksList(): void;
  getTasksList(): Array<GradleTask>;
  setTasksList(value: Array<GradleTask>): void;
  addTasks(value?: GradleTask, index?: number): GradleTask;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GetTasksResult.AsObject;
  static toObject(includeInstance: boolean, msg: GetTasksResult): GetTasksResult.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GetTasksResult, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GetTasksResult;
  static deserializeBinaryFromReader(message: GetTasksResult, reader: jspb.BinaryReader): GetTasksResult;
}

export namespace GetTasksResult {
  export type AsObject = {
    message: string,
    tasksList: Array<GradleTask.AsObject>,
  }
}

export class RunTaskRequest extends jspb.Message {
  getSourceDir(): string;
  setSourceDir(value: string): void;

  getTask(): string;
  setTask(value: string): void;

  clearArgsList(): void;
  getArgsList(): Array<string>;
  setArgsList(value: Array<string>): void;
  addArgs(value: string, index?: number): string;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RunTaskRequest.AsObject;
  static toObject(includeInstance: boolean, msg: RunTaskRequest): RunTaskRequest.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RunTaskRequest, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RunTaskRequest;
  static deserializeBinaryFromReader(message: RunTaskRequest, reader: jspb.BinaryReader): RunTaskRequest;
}

export namespace RunTaskRequest {
  export type AsObject = {
    sourceDir: string,
    task: string,
    argsList: Array<string>,
  }
}

export class RunTaskReply extends jspb.Message {
  hasRunTaskResult(): boolean;
  clearRunTaskResult(): void;
  getRunTaskResult(): RunTaskResult | undefined;
  setRunTaskResult(value?: RunTaskResult): void;

  hasProgress(): boolean;
  clearProgress(): void;
  getProgress(): Progress | undefined;
  setProgress(value?: Progress): void;

  hasOutput(): boolean;
  clearOutput(): void;
  getOutput(): Output | undefined;
  setOutput(value?: Output): void;

  getKindCase(): RunTaskReply.KindCase;
  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RunTaskReply.AsObject;
  static toObject(includeInstance: boolean, msg: RunTaskReply): RunTaskReply.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RunTaskReply, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RunTaskReply;
  static deserializeBinaryFromReader(message: RunTaskReply, reader: jspb.BinaryReader): RunTaskReply;
}

export namespace RunTaskReply {
  export type AsObject = {
    runTaskResult?: RunTaskResult.AsObject,
    progress?: Progress.AsObject,
    output?: Output.AsObject,
  }

  export enum KindCase {
    KIND_NOT_SET = 0,
    RUN_TASK_RESULT = 1,
    PROGRESS = 2,
    OUTPUT = 3,
  }
}

export class GradleTask extends jspb.Message {
  getName(): string;
  setName(value: string): void;

  getGroup(): string;
  setGroup(value: string): void;

  getPath(): string;
  setPath(value: string): void;

  getProject(): string;
  setProject(value: string): void;

  getBuildfile(): string;
  setBuildfile(value: string): void;

  getRootproject(): string;
  setRootproject(value: string): void;

  getDescription(): string;
  setDescription(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): GradleTask.AsObject;
  static toObject(includeInstance: boolean, msg: GradleTask): GradleTask.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: GradleTask, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): GradleTask;
  static deserializeBinaryFromReader(message: GradleTask, reader: jspb.BinaryReader): GradleTask;
}

export namespace GradleTask {
  export type AsObject = {
    name: string,
    group: string,
    path: string,
    project: string,
    buildfile: string,
    rootproject: string,
    description: string,
  }
}

export class Progress extends jspb.Message {
  getMessage(): string;
  setMessage(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Progress.AsObject;
  static toObject(includeInstance: boolean, msg: Progress): Progress.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Progress, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Progress;
  static deserializeBinaryFromReader(message: Progress, reader: jspb.BinaryReader): Progress;
}

export namespace Progress {
  export type AsObject = {
    message: string,
  }
}

export class RunTaskResult extends jspb.Message {
  getMessage(): string;
  setMessage(value: string): void;

  getTask(): string;
  setTask(value: string): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): RunTaskResult.AsObject;
  static toObject(includeInstance: boolean, msg: RunTaskResult): RunTaskResult.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: RunTaskResult, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): RunTaskResult;
  static deserializeBinaryFromReader(message: RunTaskResult, reader: jspb.BinaryReader): RunTaskResult;
}

export namespace RunTaskResult {
  export type AsObject = {
    message: string,
    task: string,
  }
}

export class Output extends jspb.Message {
  getMessage(): string;
  setMessage(value: string): void;

  getOutputType(): Output.OutputTypeMap[keyof Output.OutputTypeMap];
  setOutputType(value: Output.OutputTypeMap[keyof Output.OutputTypeMap]): void;

  serializeBinary(): Uint8Array;
  toObject(includeInstance?: boolean): Output.AsObject;
  static toObject(includeInstance: boolean, msg: Output): Output.AsObject;
  static extensions: {[key: number]: jspb.ExtensionFieldInfo<jspb.Message>};
  static extensionsBinary: {[key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message>};
  static serializeBinaryToWriter(message: Output, writer: jspb.BinaryWriter): void;
  static deserializeBinary(bytes: Uint8Array): Output;
  static deserializeBinaryFromReader(message: Output, reader: jspb.BinaryReader): Output;
}

export namespace Output {
  export type AsObject = {
    message: string,
    outputType: Output.OutputTypeMap[keyof Output.OutputTypeMap],
  }

  export interface OutputTypeMap {
    STDERR: 0;
    STDOUT: 1;
  }

  export const OutputType: OutputTypeMap;
}

