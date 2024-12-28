import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { AnalysisWorkflowStack } from "./analysis-workflow-stack";

export class SentimentAnalysisStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new AnalysisWorkflowStack(this, "AnalysisWorkflowStack");
  }
}
