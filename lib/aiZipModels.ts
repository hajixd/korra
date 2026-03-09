import { readFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { DEFAULT_STRATEGY_MODEL_NAMES } from "./strategyCatalog";

const AI_ZIP_PATH = path.join(process.cwd(), "AI.zip");
const AI_ZIP_APP_SOURCE_PATH = "/src/App.tsx";
const ZIP_LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_STORE_METHOD = 0;
const ZIP_DEFLATE_METHOD = 8;
const MODELS_ARRAY_PATTERN = /const\s+MODELS\s*=\s*\[([\s\S]*?)\];/;

const fallbackAiZipModelNames = [...DEFAULT_STRATEGY_MODEL_NAMES];

const extractModelsFromSource = (source: string): string[] => {
  const body = source.match(MODELS_ARRAY_PATTERN)?.[1];

  if (!body) {
    return [];
  }

  const modelNames: string[] = [];
  const seen = new Set<string>();

  for (const match of body.matchAll(/["'`]([^"'`]+)["'`]/g)) {
    const name = match[1]?.trim();

    if (!name || seen.has(name)) {
      continue;
    }

    seen.add(name);
    modelNames.push(name);
  }

  return modelNames;
};

const findEndOfCentralDirectory = (zipBuffer: Buffer): number => {
  if (zipBuffer.length < 22) {
    return -1;
  }

  const lowerBound = Math.max(0, zipBuffer.length - 0xffff - 22);

  for (let offset = zipBuffer.length - 22; offset >= lowerBound; offset -= 1) {
    if (zipBuffer.readUInt32LE(offset) === ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }

  return -1;
};

const extractTextFileFromZip = (zipBuffer: Buffer, entryPath: string): string | null => {
  const eocdOffset = findEndOfCentralDirectory(zipBuffer);

  if (eocdOffset < 0 || eocdOffset + 22 > zipBuffer.length) {
    return null;
  }

  const centralDirectorySize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  if (
    centralDirectoryOffset < 0 ||
    centralDirectoryOffset >= zipBuffer.length ||
    centralDirectoryEnd > zipBuffer.length
  ) {
    return null;
  }

  let offset = centralDirectoryOffset;

  while (offset + 46 <= centralDirectoryEnd) {
    if (zipBuffer.readUInt32LE(offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) {
      return null;
    }

    const compressionMethod = zipBuffer.readUInt16LE(offset + 10);
    const compressedSize = zipBuffer.readUInt32LE(offset + 20);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 28);
    const extraLength = zipBuffer.readUInt16LE(offset + 30);
    const commentLength = zipBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;
    const nextOffset = fileNameEnd + extraLength + commentLength;

    if (fileNameEnd > zipBuffer.length || nextOffset > zipBuffer.length) {
      return null;
    }

    const fileName = zipBuffer.toString("utf8", fileNameStart, fileNameEnd);

    if (fileName === entryPath) {
      if (
        localHeaderOffset < 0 ||
        localHeaderOffset + 30 > zipBuffer.length ||
        zipBuffer.readUInt32LE(localHeaderOffset) !== ZIP_LOCAL_FILE_HEADER_SIGNATURE
      ) {
        return null;
      }

      const localFileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;

      if (dataEnd > zipBuffer.length) {
        return null;
      }

      const compressedEntry = zipBuffer.subarray(dataStart, dataEnd);

      if (compressionMethod === ZIP_STORE_METHOD) {
        return compressedEntry.toString("utf8");
      }

      if (compressionMethod === ZIP_DEFLATE_METHOD) {
        return inflateRawSync(compressedEntry).toString("utf8");
      }

      return null;
    }

    offset = nextOffset;
  }

  return null;
};

export const getAiZipModelNames = async (): Promise<string[]> => {
  try {
    const zipBuffer = await readFile(AI_ZIP_PATH);
    const appSource = extractTextFileFromZip(zipBuffer, AI_ZIP_APP_SOURCE_PATH);
    const modelNames = appSource ? extractModelsFromSource(appSource) : [];

    return modelNames.length > 0 ? modelNames : fallbackAiZipModelNames;
  } catch {
    return fallbackAiZipModelNames;
  }
};
