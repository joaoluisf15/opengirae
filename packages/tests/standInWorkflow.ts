import { DBOS } from "@girae/common/dbos"

export class StandInWorkflow {
  @DBOS.workflow()
  static async park(topic: string, timeoutSeconds: number = 30): Promise<void> {
    await DBOS.recv(topic, timeoutSeconds)
  }
}
