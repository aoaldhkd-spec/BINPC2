/** Bound the whole operation, including authentication before fetch starts. */
export async function withRequestDeadline<T>(work: (signal: AbortSignal) => Promise<T>, ms = 20_000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('연결이 지연되고 있습니다. 잠시 후 다시 확인해 주세요. 저장된 결과는 유지됩니다.'));
    }, ms);
  });
  try { return await Promise.race([work(controller.signal), deadline]); }
  finally { clearTimeout(timer!); }
}
