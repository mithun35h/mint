// TODO: Add Types
import fse from "fs-extra";
import { promises as _promises } from "fs";
import { CLIENT_PATH, CMD_EXEC_PATH } from "../../constants.js";
import { join } from "path";
import { generateNav } from "./generate.js";
import { categorizeFiles } from "./categorize.js";

const { readFile } = _promises;

// TODO: Put in prebuild package

export const updateGeneratedNav = async () => {
  const generatedNav = await generateNav();
  const targetPath = join(CLIENT_PATH, "src", "_props", "generatedNav.json");
  await fse.outputFile(targetPath, JSON.stringify(generatedNav, null, 2), {
    flag: "w",
  });
};

export const updateOpenApiFiles = async () => {
  const { openApiFiles } = await categorizeFiles(CMD_EXEC_PATH);
  const targetPath = join(CLIENT_PATH, "src", "_props", "openApiFiles.json");
  await fse.outputFile(targetPath, JSON.stringify(openApiFiles, null, 2), {
    flag: "w",
  });
};
