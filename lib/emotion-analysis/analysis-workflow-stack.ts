import {
  Duration,
  NestedStack,
  NestedStackProps,
  RemovalPolicy,
} from "aws-cdk-lib";
import { IRuleTarget, Rule, RuleTargetInput } from "aws-cdk-lib/aws-events";
import { SfnStateMachine } from "aws-cdk-lib/aws-events-targets";
import { Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import {
  DefinitionBody,
  JsonPath,
  Parallel,
  StateMachine,
  StateMachineType,
  TaskInput,
} from "aws-cdk-lib/aws-stepfunctions";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import { FaceDetectionJob } from "./jobs/face-detection.job";
import { TranscriptionJob } from "./jobs/transcription.job";
import { SentimentDetectionJob } from "./jobs/sentiment-detection.job";

export class AnalysisWorkflowStack extends NestedStack {
  /** 感情分析のインプットとなるインタビュー動画、及び感情分析結果を格納するバケット */
  private interviewBucket: Bucket;
  /** 感情分析のワークフローコントローラー。ジョブの作成、結果のアグリゲーションを行う */
  private taskControllerFunction: Function;
  /** 感情分析を行うワークフローを定義するステイトマシン */
  private analysisStateMachine: StateMachine;

  constructor(scope: Construct, id: string, props?: NestedStackProps) {
    super(scope, id, props);

    this.interviewBucket = this.createInterviewBucket();

    this.taskControllerFunction = this.createTaskController();

    this.analysisStateMachine = this.createAnalysisStateMachine();

    this.createStartWorkflowRule();
  }

  private createInterviewBucket(): Bucket {
    return new Bucket(this, "InterviewBucket", {
      bucketName: `interview-bucket-${this.account}`,
      eventBridgeEnabled: true,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  private createTaskController(): Function {
    return new NodejsFunction(this, "task-controller", {
      functionName: "task-controller-function",
      runtime: Runtime.NODEJS_LATEST,
      // TODO: ロール作成 role:
      timeout: Duration.minutes(5),
    });
  }

  private createAnalysisStateMachine(): StateMachine {
    const analysisStartState = new LambdaInvoke(this, "AnalysisStartState", {
      lambdaFunction: this.taskControllerFunction,
      payload: TaskInput.fromObject({
        detail: JsonPath.objectAt("$.detail"),
        state: JsonPath.stateName,
      }),
    });

    const faceDetectionJob = new FaceDetectionJob(this, "FaceDetectionJob", {});
    const transcriptionJob = new TranscriptionJob(this, "TranscriptionJob", {});
    const sentimentDetectionJob = new SentimentDetectionJob(
      this,
      "SentimentDetectionJob",
      {}
    );

    const startAggregationState = new LambdaInvoke(this, "StartAggregation", {
      lambdaFunction: this.taskControllerFunction,
      payload: TaskInput.fromObject({
        detail: JsonPath.objectAt("$.detail"),
        state: JsonPath.stateName,
      }),
    });

    const parallelJob = new Parallel(this, "ParallelJobExecution")
      .branch(faceDetectionJob)
      .branch(transcriptionJob.next(sentimentDetectionJob));

    const definition = analysisStartState
      .next(parallelJob)
      .next(startAggregationState);

    return new StateMachine(this, "AnalysisStateMachine", {
      stateMachineName: "AnalysisStateMachine",
      stateMachineType: StateMachineType.STANDARD,
      definitionBody: DefinitionBody.fromChainable(definition),
      comment: "感情分析を行うワークフロー",
      // logs: TODO: logGroupを設定
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }

  private createStartWorkflowRule(): Rule {
    const targets = this.createRuleTargets();

    return new Rule(this, "StartWorkflowRule", {
      description: "Start Sentiment Analysis Workflow Rule",
      enabled: true,
      ruleName: "StartSentimentAnalysisWorkflowRule",
      eventPattern: {
        source: ["aws.s3"],
        resources: [this.interviewBucket.bucketArn],
        detailType: ["Object Created"],
        detail: {
          bucket: {
            name: [this.interviewBucket.bucketName],
          },
          object: {
            key: [
              {
                prefix: "input/",
              },
            ],
          },
        },
      },
      targets,
    });
  }

  private createRuleTargets(): IRuleTarget[] {
    return [
      new SfnStateMachine(this.analysisStateMachine, {
        // TODO: DLQの作成検討 deadLetterQueue
      }),
    ];
  }
}
