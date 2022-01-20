import * as core from '@actions/core'
import * as github from '@actions/github'

function isValidEvent(event: string, action?: string) {
  const { context } = github
  const { payload } = context
  if (event === context.eventName) {
    return action == null || action === payload.action
  }
  return false
}

function getInputAsArray(
  name: string,
  options?: core.InputOptions
): string[] {
  return getStringAsArray(core.getInput(name, options))
}

function getStringAsArray(str: string): string[] {
  return str
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(x => x !== '')
}

const octokit = github.getOctokit(core.getInput('token'))

async function toDraft(id: string): Promise<void> {
  await octokit.graphql(
    `
    mutation($id: ID!) {
      convertPullRequestToDraft(input: {pullRequestId: $id}) {
        pullRequest {
          id
          number
        }
      }
    }
    `,
    {
      id
    }
  )
}

async function toReady(id: string): Promise<void> {
  await octokit.graphql(
    `
    mutation($id: ID!) {
      markPullRequestReadyForReview(input: {pullRequestId: $id}) {
        pullRequest {
          id
          number
        }
      }
    }
    `,
    {
      id
    }
  )
}

const labels = getInputAsArray('labels')

async function run(): Promise<void> {
  try {
    const { context } = github
    core.debug(`event: ${context.eventName}`)
    core.debug(`action: ${context.payload.action}`)

    if (
      isValidEvent('pull_request_target', 'labeled') ||
      isValidEvent('pull_request_target', 'unlabeled') ||
      isValidEvent('pull_request', 'labeled') ||
      isValidEvent('pull_request', 'unlabeled')
    ) {
      

      let label = context.payload.label.name as string
      if (context.payload.action === 'unlabeled') {
        label = `-${label}`
      }

      core.debug(`Label: ${context.payload.label.name}`)

      if (context.payload.pull_request) {
        const pr = await octokit.rest.pulls.get({
          ...context.repo,
          pull_number: context.payload.pull_request?.number
        })
        if (context.payload.action === 'labeled' && labels.includes(context.payload.label.name)) {
          await toDraft(pr.data.node_id)
          core.info(
            `Pull Request ${context.payload.pull_request?.number} converted to draft`
          )
        }
        if (context.payload.action === 'unlabeled' && labels.includes(label)) {
          await toReady(pr.data.node_id)
          core.info(
            `Pull Request ${context.payload.pull_request?.number} ready for review`
          )
        }
      }
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()