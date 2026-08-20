import logger from './logger'

type IntervalTask = () => Promise<void> | void

export async function runInterval(
  tasks: IntervalTask[],
  ms: number,
): Promise<void> {
  const run = async (): Promise<void> => {
    try {
      const results = await Promise.allSettled(tasks.map(fn => fn()))

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const taskName = tasks[index].name || `Task ${index + 1}`

          logger.error(`Interval task failed: ${taskName}`, {
            cause: result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
          })
        }
      })
    } catch (unexpected) {
      logger.error('Unexpected error in runInterval', {
        cause: unexpected instanceof Error
          ? unexpected.message
          : String(unexpected)
      })
    } finally {
      setTimeout(run, ms)
    }
  }

  run()
}