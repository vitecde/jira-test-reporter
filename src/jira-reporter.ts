import {
  formatFlakyTestsMessage,
  formatResultsMessage,
} from './message-formatter'
import { type Options } from './types/reporter'
import { type Report } from 'ctrf'
import { postJiraIssue, updateJiraIssue } from './client'

/**
 * Returns true when a failed test is a "new" failure:
 *   - no insights (first-ever run, add-insights was skipped) → treat as new
 *   - insights.extra.totalResultsFailed === 1 → never failed in any prior run → new
 *   - insights.extra.totalResultsFailed > 1   → also failed in ≥1 prior run → recurring
 */
function isNewFailureTest(test: any): boolean {
  const failCount = test?.insights?.extra?.totalResultsFailed as number | undefined
  return failCount === undefined || failCount === 1
}

export async function postResultsToJira(
  report: Report,
  options: Options = {},
  logs: boolean = false
): Promise<string | null> {
  try {
    // newFailuresOnly: skip posting entirely when there are no failures that
    // are new (i.e. every currently-failed test also failed in a prior run).
    if (options.newFailuresOnly) {
      const hasNew = report.results.tests.some(
        (test) => test.status === 'failed' && isNewFailureTest(test)
      )
      if (!hasNew) {
        if (logs) {
          console.log(
            'Skipping Jira post — all failures are recurring (already seen in prior runs)'
          )
        }
        return null
      }
    }

    if (
      !options.onFailOnly ||
      (options.onFailOnly && report.results.summary.failed > 0)
    ) {
      const resultsPayload = formatResultsMessage(report, options)
      const existingKey = (report.results.extra as Record<string, unknown>)?.jiraIssue as string | undefined
      const shouldUpdate = options.updateIssue !== false && !!existingKey
      if (shouldUpdate) {
        if (logs) {
          console.log(`Updating existing Jira issue ${existingKey}...`)
        }
        await updateJiraIssue(existingKey!, resultsPayload)
        if (logs) {
          console.log('Successfully posted test results to Jira')
        }
        return existingKey!
      } else {
        if (logs) {
          console.log('Creating new Jira issue...')
        }
        const issueKey = await postJiraIssue(resultsPayload)
        if (logs) {
          console.log('Successfully posted test results to Jira')
        }
        return issueKey
      }
    } else {
      if (logs) {
        console.log(
          'Skipping posting test results to Jira as onFailOnly is true and there are no failed tests'
        )
      }
      return null
    }
  } catch (error) {
    if (logs) {
      console.error('Error posting to Jira:', error)
    }
    throw error
  }
}

export async function postFlakyTestsToJira(
  report: Report,
  options: Options = {},
  logs: boolean = false
): Promise<string | null> {
  try {
    const flakyPayload = formatFlakyTestsMessage(report, options)
    if (flakyPayload) {
      const existingKey = (report.results.extra as Record<string, unknown>)?.jiraFlakyIssue as string | undefined
      const shouldUpdate = options.updateIssue !== false && !!existingKey
      if (shouldUpdate) {
        if (logs) {
          console.log(`Updating existing Jira issue ${existingKey}...`)
        }
        await updateJiraIssue(existingKey!, flakyPayload)
        if (logs) {
          console.log('Successfully posted flaky tests to Jira')
        }
        return existingKey!
      } else {
        if (logs) {
          console.log('Creating new Jira issue...')
        }
        const issueKey = await postJiraIssue(flakyPayload)
        if (logs) {
          console.log('Successfully posted flaky tests to Jira')
        }
        return issueKey
      }
    }
    return null
  } catch (error) {
    if (logs) {
      console.error('Error posting to Jira:', error)
    }
    throw error
  }
}
