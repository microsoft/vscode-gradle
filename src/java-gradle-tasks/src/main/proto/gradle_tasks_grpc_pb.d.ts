// GENERATED CODE -- DO NOT EDIT!

// package: gradletasks
// file: java-gradle-tasks/src/main/proto/gradle_tasks.proto

import * as java_gradle_tasks_src_main_proto_gradle_tasks_pb from "../../../../java-gradle-tasks/src/main/proto/gradle_tasks_pb";
import * as grpc from "@grpc/grpc-js";

interface IGradleTasksService extends grpc.ServiceDefinition<grpc.UntypedServiceImplementation> {
  getTasks: grpc.MethodDefinition<java_gradle_tasks_src_main_proto_gradle_tasks_pb.GetTasksRequest, java_gradle_tasks_src_main_proto_gradle_tasks_pb.GetTasksReply>;
  runTask: grpc.MethodDefinition<java_gradle_tasks_src_main_proto_gradle_tasks_pb.RunTaskRequest, java_gradle_tasks_src_main_proto_gradle_tasks_pb.RunTaskReply>;
}

export const GradleTasksService: IGradleTasksService;

export class GradleTasksClient extends grpc.Client {
  constructor(address: string, credentials: grpc.ChannelCredentials, options?: object);
  getTasks(argument: java_gradle_tasks_src_main_proto_gradle_tasks_pb.GetTasksRequest, metadataOrOptions?: grpc.Metadata | grpc.CallOptions | null): grpc.ClientReadableStream<java_gradle_tasks_src_main_proto_gradle_tasks_pb.GetTasksReply>;
  getTasks(argument: java_gradle_tasks_src_main_proto_gradle_tasks_pb.GetTasksRequest, metadata?: grpc.Metadata | null, options?: grpc.CallOptions | null): grpc.ClientReadableStream<java_gradle_tasks_src_main_proto_gradle_tasks_pb.GetTasksReply>;
  runTask(argument: java_gradle_tasks_src_main_proto_gradle_tasks_pb.RunTaskRequest, metadataOrOptions?: grpc.Metadata | grpc.CallOptions | null): grpc.ClientReadableStream<java_gradle_tasks_src_main_proto_gradle_tasks_pb.RunTaskReply>;
  runTask(argument: java_gradle_tasks_src_main_proto_gradle_tasks_pb.RunTaskRequest, metadata?: grpc.Metadata | null, options?: grpc.CallOptions | null): grpc.ClientReadableStream<java_gradle_tasks_src_main_proto_gradle_tasks_pb.RunTaskReply>;
}
