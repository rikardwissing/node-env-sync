const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const rootDir = process.cwd();
const envSyncerDir = path.normalize(`${rootDir}/.env-sync`);
const tmpDir = path.normalize(`${envSyncerDir}/tmp`);

const envFiles = require(`${envSyncerDir}/files.json`);

let envConfig
const envConfigPath = `${envSyncerDir}/env.json`
if(fs.existsSync(envConfigPath)) {
  envConfig = require(`${envSyncerDir}/env.json`);
}

const removeTempFolder = () => {
  execSync(`rm -rf ${tmpDir}`, { stdio: "inherit" });
};

const getFileContent = ({ file, replace }, reverse) => {
  if(!replace) {
    return fs.readFileSync(`${rootDir}/${file}`);
  }

  let fileContent = fs.readFileSync(`${rootDir}/${file}`).toString();

  if (replace) {
    replace.forEach(r => {
      if(reverse) {
        fileContent = fileContent.replace(new RegExp(envConfig[r], "g"), r);
      }
      else {
        fileContent = fileContent.replace(new RegExp(r, "g"), envConfig[r]);
      }
    });
  }

  return Buffer.from(fileContent);
};

const getMyEnvFilesContent = () =>
  envFiles.reduce((a, c) => { return Buffer.concat([a, getFileContent(c, true)]) }, Buffer.from(""))

const copyRestoredFiles = () => {
  envFiles.forEach(c => {
    const filePath = `${tmpDir}/my-files/${c.file}`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, getFileContent(c, true));
  });
};

const archiveRestoredFiles = () => {
  const fileList = envFiles.map(a => a.file).join(" ");
  execSync(
    `cd ${tmpDir}/my-files; tar -c ${fileList} | gpg --batch --passphrase ${envConfig.archivePassword} --yes -c -o ${envSyncerDir}/archive.tar.gpg`
  );

  const myChecksum = getMyChecksum();
  fs.writeFileSync(`${envSyncerDir}/archived_checksum`, myChecksum);
};

const getMyChecksum = () =>
  crypto
    .createHash("sha256")
    .update(getMyEnvFilesContent(), "utf8")
    .digest("hex");

const getArchivedChecksum = () =>
  fs.existsSync(`${envSyncerDir}/archived_checksum`)
    ? fs.readFileSync(`${envSyncerDir}/archived_checksum`).toString()
    : "";

const extractArchivedFiles = () => {
  fs.mkdirSync(`${tmpDir}/archived-files`, { recursive: true });

  execSync(
    `cd ${tmpDir}/archived-files; gpg --batch --passphrase ${envConfig.archivePassword} --yes -d ${envSyncerDir}/archive.tar.gpg | tar -x`
  );
};

const restoreFromArchive = () => {
  execSync(
    `cd ${rootDir}; gpg --batch --passphrase ${envConfig.archivePassword} --yes -d ${envSyncerDir}/archive.tar.gpg | tar -x`
  );

  envFiles.forEach(c => {
    const filePath = `${rootDir}/${c.file}`;
    fs.writeFileSync(filePath, getFileContent(c, false));
  });
};

const printDiff = () => {
  console.log("Extracting archived for comparison...");
  extractArchivedFiles();

  console.log("Copying decustomised env files...");
  copyRestoredFiles();

  envFiles.forEach(c => {
    console.log(`Comparing ${c.file}...`);
    const archivedPath = path.relative(
      tmpDir,
      `${tmpDir}/archived-files/${c.file}`
    );
    const myPath = path.relative(tmpDir, `${tmpDir}/my-files/${c.file}`);

    try {
      execSync(
        `cd ${tmpDir}; git --no-pager diff --no-index ${archivedPath} ${myPath}`,
        {
          stdio: "inherit"
        }
      );
    } catch (err) {}
  });
};

module.exports = {
  removeTempFolder,
  archiveRestoredFiles,
  rootDir,
  envSyncerDir,
  envFiles,
  envConfigPath,
  envConfig,
  getFileContent,
  getMyEnvFilesContent,
  copyRestoredFiles,
  getMyChecksum,
  getArchivedChecksum,
  printDiff,
  restoreFromArchive
};
