const token = document.querySelector('meta[name="review-token"]').content;
const errorBox = document.querySelector('#error');
const status = document.querySelector('#status');
const refresh = document.querySelector('#refresh');
async function request(input) {
  const response = await fetch('/api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Review-Token': token },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error === 'DEDICATED_OPERATOR_DATABASE_URL_REQUIRED'
        ? 'Connect an individual reviewer login with SWIPE_REVIEW_DATABASE_URL on this computer, then restart the console.'
        : data.error.replaceAll('_', ' '),
    );
  return data.result;
}
function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function field(label, value, { multiline = false, readonly = false } = {}) {
  const wrapper = element('label', label);
  const input = element(multiline ? 'textarea' : 'input');
  input.value = value;
  input.readOnly = readonly;
  input.required = true;
  wrapper.append(input);
  return { wrapper, input };
}
function showError(error) {
  errorBox.textContent = error.message;
  errorBox.hidden = false;
}
function reviewForm(article, label, buildInput) {
  const form = element('form');
  const note = field('Review evidence / rationale', '', { multiline: true });
  note.input.maxLength = 1000;
  const button = element('button', label);
  button.type = 'submit';
  form.append(note.wrapper, button);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    button.disabled = true;
    try {
      await request({ ...buildInput(), note: note.input.value });
      status.textContent = 'Review saved. Refreshing queues…';
      await load();
    } catch (error) {
      showError(error);
    } finally {
      button.disabled = false;
    }
  });
  article.append(form);
}
function renderEmployers(rows) {
  const container = document.querySelector('#employers');
  container.replaceChildren();
  if (!rows.length) {
    container.append(element('p', 'No businesses awaiting review.'));
    return;
  }
  for (const row of rows) {
    const article = element('article');
    article.append(element('h3', row.name));
    const website = field('Website reviewed', row.website ?? '', { readonly: true });
    article.append(website.wrapper);
    article.append(
      element(
        'p',
        'Verify ownership and business evidence before approving. Entering a website is not proof of ownership.',
      ),
    );
    if (!row.website)
      article.append(
        element(
          'p',
          'No website supplied. This verification workflow requires a reviewed website; use the existing operator workflow once the business details are corrected.',
        ),
      );
    else
      reviewForm(article, 'Verify business', () => ({
        action: 'verify-employer',
        employerId: row.id,
        website: row.website,
      }));
    container.append(article);
  }
}
function renderProfiles(rows) {
  const container = document.querySelector('#profiles');
  container.replaceChildren();
  if (!rows.length) {
    container.append(element('p', 'No profiles awaiting review.'));
    return;
  }
  for (const row of rows) {
    const article = element('article');
    article.append(element('h3', `Profile ${row.candidateId} · revision ${row.draftRevision}`));
    const source = element('details');
    source.append(
      element('summary', 'Submitted draft'),
      element('pre', JSON.stringify(row.content, null, 2)),
    );
    article.append(source);
    const content = field(
      'Anonymous proposed version (JSON)',
      JSON.stringify(row.content, null, 2),
      { multiline: true },
    );
    content.input.className = 'profile-json';
    article.append(content.wrapper);
    reviewForm(article, 'Send proposal for candidate approval', () => ({
      action: 'propose-profile',
      candidateId: row.candidateId,
      revision: row.draftRevision,
      content: JSON.parse(content.input.value),
    }));
    container.append(article);
  }
}
async function load() {
  refresh.disabled = true;
  errorBox.hidden = true;
  status.textContent = 'Loading review queues…';
  // Clear previous records before a refresh; errors must never leave stale actionable queues.
  document.querySelector('#employers').replaceChildren();
  document.querySelector('#profiles').replaceChildren();
  try {
    const [employers, profiles] = await Promise.all([
      request({ action: 'pending-employers' }),
      request({ action: 'pending-profiles' }),
    ]);
    renderEmployers(employers);
    renderProfiles(profiles);
    status.textContent = `${employers.length} businesses · ${profiles.length} profiles (up to 20 per queue)`;
  } catch (error) {
    status.textContent = 'Queues unavailable';
    showError(error);
  } finally {
    refresh.disabled = false;
  }
}
refresh.addEventListener('click', load);
void load();
