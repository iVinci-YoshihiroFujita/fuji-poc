import { INextable, State, StateMachineFragment } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";

export class FaceDetectionJob extends StateMachineFragment {
  public readonly startState: State;
  public readonly endStates: INextable[];

  constructor(parent: Construct, id: string) {
    super(parent, id);
    
  }
}
