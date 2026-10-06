const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const videos = [...document.querySelectorAll('video')];
const buttons = [...document.querySelectorAll('.motion-toggle')];
function updateButton(video) {
  const button = buttons.find(item => item.dataset.video === video.id);
  if (button) button.textContent = video.paused ? 'Play animation' : 'Pause animation';
}
for (const video of videos) {
  video.addEventListener('play', () => updateButton(video));
  video.addEventListener('pause', () => updateButton(video));
}
for (const button of buttons) {
  button.addEventListener('click', () => {
    const video = document.getElementById(button.dataset.video);
    if (video.paused) {
      video.dataset.userPaused = 'false';
      video.play().catch(() => updateButton(video));
    } else {
      video.dataset.userPaused = 'true';
      video.pause();
    }
  });
}
const observer = new IntersectionObserver(entries => {
  for (const { target: video, isIntersecting } of entries) {
    video.dataset.inView = String(isIntersecting);
    if (isIntersecting && !reducedMotion.matches && video.dataset.userPaused !== 'true') video.play().catch(() => updateButton(video));
    else video.pause();
  }
}, {threshold: .12});
videos.forEach(video => observer.observe(video));
reducedMotion.addEventListener('change', () => {
  for (const video of videos) {
    if (reducedMotion.matches) video.pause();
    else if (video.dataset.inView === 'true' && video.dataset.userPaused !== 'true') video.play().catch(() => updateButton(video));
  }
});
document.getElementById('copy-citation').addEventListener('click', async () => {
  const status = document.getElementById('copy-status');
  try {
    await navigator.clipboard.writeText(document.getElementById('bibtex').textContent);
    status.textContent = 'Citation copied.';
  } catch {
    status.textContent = 'Select the citation text above to copy it.';
  }
});
