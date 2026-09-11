const track = document.querySelector('#cinematicTrack');
const backdrop = document.querySelector('.cinematic-backdrop');
const scenes = [...document.querySelectorAll('.cinematic-copy')];
const dots = [...document.querySelectorAll('.scene-progress span')];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const fade = (progress, start, end) => clamp((progress - start) / (end - start));

function updateScene() {
  const rect = track.getBoundingClientRect();
  const span = track.offsetHeight - window.innerHeight;
  const progress = clamp((-rect.top) / span);
  const one = 1 - fade(progress, .21, .31);
  const two = Math.min(fade(progress, .32, .42), 1 - fade(progress, .57, .67));
  const three = fade(progress, .69, .79);
  [one, two, three].forEach((opacity, index) => {
    scenes[index].style.opacity = opacity.toFixed(3);
    scenes[index].classList.toggle('is-visible', opacity > .3);
    dots[index].classList.toggle('active', opacity > .5);
  });
  backdrop.style.transform = `scale(${1.05 + progress * .08}) translateX(${-progress * 2}%)`;
  backdrop.style.filter = `brightness(${.94 - progress * .2}) saturate(${1 - progress * .12})`;
}

updateScene();
window.addEventListener('scroll', updateScene, { passive: true });
window.addEventListener('resize', updateScene);
