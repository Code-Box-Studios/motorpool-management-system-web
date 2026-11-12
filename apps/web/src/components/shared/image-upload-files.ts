export function toImageFileList(files: File[]): FileList | undefined {
  if (!files.length) return undefined;
  const transfer = new DataTransfer();
  files.forEach((file) => transfer.items.add(file));
  return transfer.files;
}
