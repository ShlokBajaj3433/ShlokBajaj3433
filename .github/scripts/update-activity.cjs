const fs = require('node:fs/promises');

function describeEvent(event) {
  const repository = event.repo.name;
  const url = `https://github.com/${repository}`;
  const repoLink = `[${repository}](${url})`;
  const payload = event.payload || {};

  switch (event.type) {
    case 'PushEvent': {
      // GitHub no longer includes commit counts or messages in PushEvent.
      const commit = payload.head
        ? ` ([${payload.head.slice(0, 7)}](${url}/commit/${payload.head}))` : '';
      return `🚀 Pushed code to ${repoLink}${commit}`;
    }
    case 'CreateEvent':
      return `✨ Created ${payload.ref_type || 'repository'} in ${repoLink}`;
    case 'DeleteEvent':
      return `🗑️ Deleted ${payload.ref_type || 'ref'} in ${repoLink}`;
    case 'ForkEvent':
      return `🍴 Forked ${repoLink}`;
    case 'WatchEvent':
      return `⭐ Starred ${repoLink}`;
    case 'PullRequestEvent': {
      const number = payload.number || payload.pull_request?.number;
      if (!number) return null;
      const action = payload.pull_request?.merged ? 'Merged' : {
        opened: 'Opened', closed: 'Closed', reopened: 'Reopened', merged: 'Merged',
      }[payload.action] || 'Updated';
      return `🔀 ${action} PR [#${number}](${url}/pull/${number}) in ${repoLink}`;
    }
    case 'IssuesEvent': {
      const number = payload.issue?.number;
      if (!number) return null;
      const action = {
        opened: 'Opened', closed: 'Closed', reopened: 'Reopened',
      }[payload.action] || 'Updated';
      return `🐛 ${action} issue [#${number}](${url}/issues/${number}) in ${repoLink}`;
    }
    case 'IssueCommentEvent': {
      const number = payload.issue?.number;
      if (!number) return null;
      const issueUrl = `${url}/${payload.issue.pull_request ? 'pull' : 'issues'}/${number}`;
      return `💬 Commented on [#${number}](${issueUrl}) in ${repoLink}`;
    }
    case 'PullRequestReviewEvent':
    case 'PullRequestReviewCommentEvent': {
      const number = payload.pull_request?.number;
      if (!number) return null;
      return `👀 Reviewed PR [#${number}](${url}/pull/${number}) in ${repoLink}`;
    }
    case 'ReleaseEvent':
      return `📦 Published a release in [${repository}](${url}/releases)`;
    default:
      return null;
  }
}

module.exports = async function updateActivity({ github, context, core, readmePath = 'README.md' }) {
  const startMarker = '<!--START_SECTION:activity-->';
  const endMarker = '<!--END_SECTION:activity-->';
  const readme = await fs.readFile(readmePath, 'utf8');
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);
  if (start === -1 || end <= start || readme.indexOf(startMarker, start + 1) !== -1
      || readme.indexOf(endMarker, end + 1) !== -1) {
    throw new Error('README must contain exactly one ordered pair of activity markers.');
  }

  const { data: events } = await github.rest.activity.listPublicEventsForUser({
    username: context.repo.owner,
    per_page: 100,
  });
  const entries = events
    .filter(event => event.repo?.name && event.public !== false)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map(describeEvent)
    .filter(Boolean)
    .slice(0, 10);

  if (entries.length === 0) {
    core.info('No supported public events found; preserving the current activity list.');
    return;
  }

  const newline = readme.includes('\r\n') ? '\r\n' : '\n';
  const list = entries.map((entry, index) => `${index + 1}. ${entry}`).join(newline);
  const updated = readme.slice(0, start + startMarker.length)
    + newline + list + newline + readme.slice(end);
  if (updated !== readme) {
    await fs.writeFile(readmePath, updated, 'utf8');
  }
  core.info(`Recent Activity contains ${entries.length} public events.`);
};
