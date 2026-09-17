/**
 * UI Manager - Handles DOM manipulation and input extraction.
 */
export class UI {
  constructor() {
    this.elements = {
      levelIndicator: document.getElementById('level-indicator'),
      levelTitle: document.getElementById('level-title'),
      levelStory: document.getElementById('level-story'),
      httpMethod: document.getElementById('http-method'),
      requestPath: document.getElementById('request-path'),
      paramsContainer: document.getElementById('params-container'),
      addParamBtn: document.getElementById('add-param-btn'),
      bodySection: document.getElementById('body-section'),
      requestBody: document.getElementById('request-body'),
      headerLevelId: document.getElementById('header-level-id'),
      sendBtn: document.getElementById('send-btn'),
      hintBtn: document.getElementById('hint-btn'),
      resetBtn: document.getElementById('reset-btn'),
      nextBtn: document.getElementById('next-btn'),
      responseStatusCode: document.getElementById('response-status-code'),
      responseBodyJson: document.getElementById('response-body-json'),
      feedbackPanel: document.getElementById('feedback-panel'),
      feedbackMessage: document.getElementById('feedback-message')
    };

    this.bindEvents();
  }

  bindEvents() {
    this.elements.httpMethod.addEventListener('change', () => this.toggleBodySection());
    this.elements.addParamBtn.addEventListener('click', () => this.addQueryParamRow());
  }

  toggleBodySection() {
    const method = this.elements.httpMethod.value;
    const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
    this.elements.bodySection.classList.toggle('hidden', !hasBody);
  }

  addQueryParamRow(key = '', value = '') {
    const row = document.createElement('div');
    row.className = 'query-param-row';
    row.innerHTML = `
      <input type="text" placeholder="Key" class="param-key" value="${key}">
      <input type="text" placeholder="Value" class="param-value" value="${value}">
      <button type="button" class="btn btn-danger remove-param-btn">X</button>
    `;
    row.querySelector('.remove-param-btn').addEventListener('click', () => row.remove());
    this.elements.paramsContainer.appendChild(row);
  }

  renderLevel(level, totalLevels) {
    this.elements.levelIndicator.textContent = `Level ${level.id} of ${totalLevels}`;
    this.elements.levelTitle.textContent = level.title;
    this.elements.levelStory.textContent = level.story;
    this.elements.headerLevelId.textContent = level.id;
    
    this.elements.httpMethod.value = 'GET';
    this.elements.requestPath.value = '/api/';
    this.elements.paramsContainer.innerHTML = '';
    this.elements.requestBody.value = '';
    this.toggleBodySection();
    
    this.elements.feedbackPanel.classList.add('hidden');
    this.elements.nextBtn.classList.add('hidden');
  }

  fillBuilderFromHint(hint) {
    if (hint.method) this.elements.httpMethod.value = hint.method;
    if (hint.path) this.elements.requestPath.value = hint.path;
    this.toggleBodySection();

    this.elements.paramsContainer.innerHTML = '';
    if (hint.query) {
      Object.entries(hint.query).forEach(([k, v]) => this.addQueryParamRow(k, v));
    }

    if (hint.body) {
      this.elements.requestBody.value = JSON.stringify(hint.body, null, 2);
    }
  }

  getRequestData() {
    const method = this.elements.httpMethod.value;
    const rawPath = this.elements.requestPath.value.trim();
    const [basePath, existingQuery = ''] = rawPath.split('?');
    const params = new URLSearchParams(existingQuery);

    // הוספת הפרמטרים מטבלת ה-UI
    this.elements.paramsContainer.querySelectorAll('.query-param-row').forEach(row => {
      const key = row.querySelector('.param-key').value.trim();
      const value = row.querySelector('.param-value').value.trim();
      if (key) params.append(key, value);
    });

    const queryString = params.toString();
    const fullUrl = queryString ? `${basePath}?${queryString}` : basePath;

    const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
    const body = hasBody ? this.elements.requestBody.value.trim() : null;

    return { method, fullUrl, body };
  }

  renderResponse(status, text, data) {
    this.elements.responseStatusCode.textContent = `${status} ${text}`;
    this.elements.responseStatusCode.className = status >= 200 && status < 300 ? 'status-success' : 'status-error';
    this.elements.responseBodyJson.textContent = JSON.stringify(data, null, 2);
  }

  renderVerdict(passed, message,isLastLevel = false) {
    this.elements.feedbackPanel.classList.remove('hidden');
    this.elements.feedbackMessage.textContent = message;
    this.elements.feedbackMessage.className = `feedback-message ${passed ? 'status-success' : 'status-error'}`;
    
  if (passed && !isLastLevel) {
    this.elements.nextBtn.classList.remove('hidden');
  } else {
    this.elements.nextBtn.classList.add('hidden');
  }
  }
}