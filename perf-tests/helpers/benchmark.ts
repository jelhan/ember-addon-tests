export default async function (
  description: string,
  iterations: number,
  callback: (i: number) => void
): Promise<void> {
  console.log(`Running benchmark: ${description}`);
  for (let i = 1; i <= iterations; i++) {
    const start = Date.now();
    await callback(i);
    const duration = Date.now() - start;
    console.log(`Run ${i}: ${duration}ms`);
  }
}
