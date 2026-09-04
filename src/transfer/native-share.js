function cancelledResult(error) {
  if (error?.name === "AbortError") return { shared: false, reason: "cancelled" };
  if (error?.name === "NotAllowedError") return { shared: false, reason: "denied" };
  throw error;
}

export async function shareLink({ title, text, url }) {
  if (typeof navigator.share !== "function") return { shared: false, reason: "unsupported" };
  try {
    await navigator.share({ title, text, url });
    return { shared: true };
  } catch (error) {
    return cancelledResult(error);
  }
}

export async function shareFile({ file, title, text = "VaultDrop ile şifreli olarak gönderildi." }) {
  const data = { files: [file], title, text };
  if (typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    return { shared: false, reason: "unsupported" };
  }
  if (!navigator.canShare(data)) return { shared: false, reason: "unsupported" };
  try {
    await navigator.share(data);
    return { shared: true };
  } catch (error) {
    return cancelledResult(error);
  }
}
