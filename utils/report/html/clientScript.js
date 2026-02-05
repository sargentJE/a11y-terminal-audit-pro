export const REPORT_HTML_CLIENT_SCRIPT = `
function showTab(event, tabId) {
  document.querySelectorAll('.lh-tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.lh-tab').forEach(el => el.classList.remove('active'));

  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
}

function filterIssues(event, severity) {
  const issues = document.querySelectorAll('#issues-list .lh-audit');
  const btns = document.querySelectorAll('.lh-filter-btn');

  btns.forEach(btn => btn.classList.remove('active'));
  event.target.classList.add('active');

  issues.forEach(issue => {
    if (severity === 'all') {
      issue.style.display = '';
    } else {
      issue.style.display = issue.classList.contains('lh-audit--' + severity) ? '' : 'none';
    }
  });
}
`;

export default REPORT_HTML_CLIENT_SCRIPT;
