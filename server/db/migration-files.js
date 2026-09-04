export function listMigrationFiles(fileNames) {
  return fileNames.filter((fileName) => fileName.endsWith(".sql")).toSorted();
}
