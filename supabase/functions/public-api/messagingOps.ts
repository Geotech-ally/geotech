type WriteResult = { error: unknown | null }

/** Best-effort cleanup for a file uploaded before its message row was saved. */
export async function insertMessageWithAttachmentCleanup(
  writeMessage: () => Promise<WriteResult>,
  removeUploadedFile: () => Promise<boolean>,
) {
  let result: WriteResult
  try { result = await writeMessage() }
  catch { return { saved: false, cleanupSucceeded: false } }
  if (!result.error) return { saved: true, cleanupSucceeded: true }
  try { return { saved: false, cleanupSucceeded: await removeUploadedFile() } }
  catch { return { saved: false, cleanupSucceeded: false } }
}
