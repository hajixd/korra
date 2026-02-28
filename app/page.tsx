import { getAiZipModelNames } from "../lib/aiZipModels";
import TradingTerminal from "./TradingTerminal";

export default async function Home() {
  const aiZipModelNames = await getAiZipModelNames();

  return <TradingTerminal aiZipModelNames={aiZipModelNames} />;
}
