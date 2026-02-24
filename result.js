const qs = new URLSearchParams(location.search);
const name = qs.get('name') || 'Player';
const category = qs.get('category') || 'All Categories';
const score = qs.get('score') || '0';
const correct = qs.get('correct') || '0';
const total = qs.get('total') || '0';

document.getElementById('name').textContent = name;
document.getElementById('cat').textContent = category;
document.getElementById('score').textContent = score;
document.getElementById('correct').textContent = correct;
document.getElementById('total').textContent = total;

document.getElementById('playAgain').addEventListener('click', () => location.href = 'index.html');

document.getElementById('share').addEventListener('click', async () => {
  const text = `${name} scored ${score} in Bible Trivia (${category})!`;
  const url = location.origin + location.pathname.replace('result.html','leaderboard.html');
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Bible Trivia Score', text, url });
    } else {
      await navigator.clipboard.writeText(text + ' ' + url);
      alert('Copied to clipboard!');
    }
  } catch (e) {
    console.error(e);
  }
});
