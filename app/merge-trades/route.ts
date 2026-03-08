import { createCopytradeDashboardResponse } from "../copytradeEmbeddedResponse";

export async function GET() {
  return createCopytradeDashboardResponse();
}
