/**
 * 업데이트 피드 → 플랫폼별 다운로드 URL
 * CHANGELOG 기반 릴리스 노트 렌더
 */
const FEED_URLS = [
  "https://update.uany.net/tonghab-minwon-info/update.json",
  "https://uany-update.pages.dev/tonghab-minwon-info/update.json",
];

const PLATFORMS = [
  "win32-x64",
  "linux-x64",
  "darwin-arm64",
  "darwin-x64",
];

const versionEl = document.getElementById("release-version");
const changelogRoot = document.getElementById("changelog-root");

function formatBytes(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  const mb = n / (1024 * 1024);
  return `${mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}

function applyPlatformUrls(manifest) {
  const tag = manifest?.name || (manifest?.version ? `v${manifest.version}` : null);
  const platforms = manifest?.platforms || {};

  for (const key of PLATFORMS) {
    const link = document.querySelector(`[data-platform="${key}"]`);
    if (!link) continue;
    const info = platforms[key];
    const url =
      info?.downloadUrl ||
      (tag
        ? `https://tonghab-update-download.romico-ccb.workers.dev/download?tag=${encodeURIComponent(tag)}&platform=${encodeURIComponent(key)}`
        : null) ||
      (key === "win32-x64" ? manifest?.downloadUrl || manifest?.url : null);

    if (url) link.href = url;

    const meta = link.querySelector(".platform-meta");
    if (meta && info) {
      const base = meta.dataset.base || meta.textContent.trim();
      meta.dataset.base = base;
      const size = formatBytes(info.size);
      meta.textContent = size ? `${base} · ${size}` : base;
    }
  }

  if (versionEl && manifest?.version) {
    versionEl.textContent = String(manifest.version).startsWith("v")
      ? manifest.version
      : `v${manifest.version}`;
  }
}

async function loadFeed() {
  for (const url of FEED_URLS) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      applyPlatformUrls(data);
      return;
    } catch {
      /* try next */
    }
  }
}

function sectionList(title, items) {
  if (!items?.length) return "";
  const lis = items.map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  return `<h4>${escapeHtml(title)}</h4><ul>${lis}</ul>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderChangelog(data) {
  if (!changelogRoot || !data?.entries?.length) return;
  const html = data.entries
    .map((e) => {
      const ver = escapeHtml(e.version);
      const date = e.date ? `<time datetime="${escapeHtml(e.date)}">${escapeHtml(e.date)}</time>` : "";
      const summary = e.summary
        ? `<p class="changelog-summary">${escapeHtml(e.summary)}</p>`
        : "";
      return `
        <article class="changelog-entry">
          <header>
            <h3>v${ver}</h3>
            ${date}
          </header>
          ${summary}
          ${sectionList("Added", e.added)}
          ${sectionList("Changed", e.changed)}
          ${sectionList("Fixed", e.fixed)}
        </article>`;
    })
    .join("");
  changelogRoot.innerHTML = html;
}

async function loadChangelog() {
  try {
    const res = await fetch("./changelog.json", { cache: "no-store" });
    if (!res.ok) throw new Error("changelog missing");
    renderChangelog(await res.json());
  } catch {
    if (changelogRoot) {
      changelogRoot.innerHTML =
        '<p class="changelog-fallback">변경 이력을 불러오지 못했습니다. 저장소의 <code>CHANGELOG.md</code>를 참고하세요.</p>';
    }
  }
}

function observeReveal() {
  const nodes = document.querySelectorAll(
    ".feature-list li, .steps li, .platform-list li, .changelog-entry",
  );
  if (!("IntersectionObserver" in window)) {
    nodes.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -6% 0px" },
  );
  nodes.forEach((el) => io.observe(el));
}

void loadFeed();
void loadChangelog().then(observeReveal);
