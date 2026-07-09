const sidebar = document.querySelector('#sidebar');
const sidebarToggle = document.querySelector('#sidebarToggle');

sidebarToggle?.addEventListener('click', () => {
  sidebar?.classList.toggle('is-collapsed');
});

document.querySelectorAll('.section-button').forEach((button) => {
  const list = button.nextElementSibling;
  button.addEventListener('click', () => {
    button.classList.toggle('is-open');
    list?.classList.toggle('is-open');
  });
});
