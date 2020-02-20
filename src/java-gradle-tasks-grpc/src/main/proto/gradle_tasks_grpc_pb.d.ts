// package: gradletasks
// file: java-gradle-tasks-grpc/src/main/proto/gradle_tasks.proto

/* tslint:disable */
/* eslint-disable */

import * as grpc from "@grpc/grpc-js";
import * as java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb from "../../../../java-gradle-tasks-grpc/src/main/proto/gradle_tasks_pb";

interface IGradleTasksService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
    getTasks: IGradleTasksService_IGetTasks;
    runTask: IGradleTasksService_IRunTask;
}

interface IGradleTasksService_IGetTasks extends grpc.MethodDefinition<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksRequest, java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksReply> {
    path: string; // "/gradletasks.GradleTasks/GetTasks"
    requestStream: boolean; // false
    responseStream: boolean; // true
    requestSerialize: grpc.serialize<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksRequest>;
    requestDeserialize: grpc.deserialize<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksRequest>;
    responseSerialize: grpc.serialize<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksReply>;
    responseDeserialize: grpc.deserialize<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksReply>;
}
interface IGradleTasksService_IRunTask extends grpc.MethodDefinition<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskRequest, java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskReply> {
    path: string; // "/gradletasks.GradleTasks/RunTask"
    requestStream: boolean; // false
    responseStream: boolean; // true
    requestSerialize: grpc.serialize<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskRequest>;
    requestDeserialize: grpc.deserialize<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskRequest>;
    responseSerialize: grpc.serialize<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskReply>;
    responseDeserialize: grpc.deserialize<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskReply>;
}

export const GradleTasksService: IGradleTasksService;

export interface IGradleTasksServer {
    getTasks: grpc.handleServerStreamingCall<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksRequest, java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksReply>;
    runTask: grpc.handleServerStreamingCall<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskRequest, java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskReply>;
}

export interface IGradleTasksClient {
    getTasks(request: java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksRequest, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksReply>;
    getTasks(request: java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksRequest, metadata?: grpc.Metadata, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksReply>;
    runTask(request: java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskRequest, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskReply>;
    runTask(request: java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskRequest, metadata?: grpc.Metadata, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskReply>;
}

export class GradleTasksClient extends grpc.Client implements IGradleTasksClient {
    constructor(address: string, credentials: grpc.ChannelCredentials, options?: object);
    public getTasks(request: java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksRequest, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksReply>;
    public getTasks(request: java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksRequest, metadata?: grpc.Metadata, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.GetTasksReply>;
    public runTask(request: java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskRequest, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskReply>;
    public runTask(request: java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskRequest, metadata?: grpc.Metadata, options?: Partial<grpc.CallOptions>): grpc.ClientReadableStream<java_gradle_tasks_grpc_src_main_proto_gradle_tasks_pb.RunTaskReply>;
}
