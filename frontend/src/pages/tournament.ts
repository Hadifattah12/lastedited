import '../styles/home.css';
import '../styles/tournament.css';
import confetti from 'canvas-confetti';
import i18next from 'i18next';
import { apiFetch, BACKEND_BASE } from '../utils/api';
export function renderTournament(): HTMLElement {
  const container = document.createElement('div');
  const tournamentStarted = localStorage.getItem('tournamentStarted') === 'true';
  let playerCount = Number(localStorage.getItem('tournamentPlayerCount') || '0');
  let currentRound = Number(localStorage.getItem('tournamentCurrentRound') || '1');
  
  // Get the logged-in username from the user object in localStorage
  const getUserData = () => {
    try {
      const userData = localStorage.getItem('user');
      if (userData) {
        const user = JSON.parse(userData);
        return user.name || 'Player1';
      }
    } catch (error) {
      console.error('Error parsing user data:', error);
    }
    return 'Player1';
  };
  
  const loggedInUsername = getUserData();
    container.className = 'tournament-wrapper';
  if (!tournamentStarted || playerCount === 0) {
    container.innerHTML = `
      <div class="tournament-wrapper">
        <div class="tournament-container">
          <h2 style="color:white">${i18next.t('tournamentSetup')}</h2>
          <form id="setupForm">
            <label style="color:white">${i18next.t('selectPlayers')}</label><br>
            <select name="playerCount" required class="player-input">
              <option value="4">${i18next.t('4players')}</option>
              <option value="8">${i18next.t('8players')}</option>
            </select><br><br>
            <button type="submit" class="action-btn">${i18next.t('continue')}</button>
          </form>
          <div id="aliasFormWrapper"></div>
        </div>
      </div>
    `;

    const setupForm = container.querySelector('#setupForm') as HTMLFormElement;
    setupForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(setupForm);
      playerCount = Number(formData.get('playerCount'));
      localStorage.setItem('tournamentPlayerCount', playerCount.toString());
      showAliasForm(playerCount);
    });

    function showAliasForm(count: number) {
      const aliasWrapper = container.querySelector('#aliasFormWrapper')!;
      // Calculate how many additional aliases are needed (total - 1 for logged-in user)
      const aliasesNeeded = count - 1;
      
      aliasWrapper.innerHTML = `
        <form id="registerForm">
          <h3 style="color:white">${i18next.t('enterAliases')}</h3>
          <div style="color: #4CAF50; margin-bottom: 10px;">
            <strong>${i18next.t('yourAlias')}: ${loggedInUsername}</strong>
          </div>
          <div id="formError" style="color: #ff4d4d; font-weight: bold; margin-bottom: 10px;"></div>
          ${[...Array(aliasesNeeded)].map((_, i) => `
            <input name="player${i + 1}" placeholder="${i18next.t('aliasPlaceholder', { number: i + 2 })}" required class="player-input"><br>
          `).join('')}
          <button type="submit" class="action-btn">${i18next.t('startTournament')}</button>
        </form>
      `;

      const form = aliasWrapper.querySelector('#registerForm') as HTMLFormElement;
      const errorBox = form.querySelector('#formError') as HTMLElement;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rawAliases = [...new FormData(form).values()].map(v => v.toString().trim());
        
        // Add the logged-in username to the beginning of the aliases array
        const allAliases = [loggedInUsername, ...rawAliases];

        errorBox.textContent = '';

        if (rawAliases.some(alias => alias === '')) {
          errorBox.textContent = i18next.t('emptyAliasError');
          return;
        }

        if (rawAliases.some(alias => !/[a-zA-Z]/.test(alias))) {
          errorBox.textContent = i18next.t('noLetterAliasError');
          return;
        }

        if (rawAliases.some(alias => alias.length < 4)) {
          errorBox.textContent = i18next.t('shortAliasError');
          return;
        }

        // Check for duplicates including the logged-in username
        const uniqueAliases = new Set(allAliases.map(name => name.toLowerCase()));
        if (uniqueAliases.size !== allAliases.length) {
          errorBox.textContent = i18next.t('duplicateAliasError');
          return;
        }

        // Check if any input alias matches the logged-in username
        if (rawAliases.some(alias => alias.toLowerCase() === loggedInUsername.toLowerCase())) {
          errorBox.textContent = i18next.t('duplicateWithUserError', { username: loggedInUsername });
          return;
        }

      
const res = await apiFetch('/api/tournament/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ aliases: allAliases })
});

        const data = await res.json();
        if (!res.ok) {
          errorBox.textContent = i18next.t('failedToStart');
          return;
        }

        localStorage.setItem('tournamentStarted', 'true');
        localStorage.setItem('tournamentCurrentRound', '1');
        location.reload();
      });
    }
  } else {
   apiFetch('/api/tournament/matches')
  .then(res => res.json())
  .then(data => {
    if (data.matches) showMatches(data.matches);
  })
  .catch(() => {});
  }

  function showMatches(matches: any[]) {
    const display = container.querySelector('#matchDisplay') ?? document.createElement('div');
    display.id = 'matchDisplay';
    display.className = 'tournament-match-box';

    display.innerHTML = `<h3 style="color:white">${i18next.t('roundMatches', { round: currentRound })}</h3>` +
      matches.map(m => {
        const disabled = m.winner ? 'disabled' : '';
        let label = `${m.player1} vs ${m.player2}`;
        if (m.winner) {
          const loser = m.winner === m.player1 ? m.player2 : m.player1;
          label = `<strong style="color:limegreen;">${m.winner}</strong> vs ${loser} ✅`;
        }
        return `<button class="action-btn" style="margin: 5px;" data-id="${m.id}" data-round="${m.round}" ${disabled}>${label}</button>`;
      }).join('');

    display.innerHTML = display.innerHTML.replace(/&lt;/g, '<').replace(/&gt;/g, '>');

    if (!display.parentElement) container.appendChild(display);

    display.querySelectorAll('button').forEach(button => {
      if (!button.hasAttribute('disabled')) {
        button.addEventListener('click', () => {
          const matchId = Number(button.getAttribute('data-id'));
          const round = Number(button.getAttribute('data-round'));
          const [player1, player2] = button.textContent!.replace(' ✅', '').split(' vs ');

          localStorage.setItem('gameData', JSON.stringify({ player1, player2 }));
          localStorage.setItem('tournamentMatch', JSON.stringify({ matchId, round }));
          location.hash = '/pong';
        });
      }
    });

    const allPlayed = matches.every(m => m.winner);

    if (allPlayed) {
      if (matches.length === 1) {
        const finalWinner = matches[0].winner;
        const winnerBtn = document.createElement('button');
        winnerBtn.className = 'action-btn';
        winnerBtn.textContent = i18next.t('showWinner');
        winnerBtn.style.marginTop = '20px';

        winnerBtn.addEventListener('click', () => {
          display.innerHTML += `<h2 style='color: gold; margin-top: 20px;'>${i18next.t('champion', { winner: finalWinner })}</h2>`;
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });

          localStorage.removeItem('tournamentStarted');
          localStorage.removeItem('tournamentPlayerCount');
          localStorage.removeItem('tournamentCurrentRound');
          localStorage.removeItem('tournamentMatch');
          
          const homeBtn = document.createElement('button');
          homeBtn.className = 'action-btn';
          homeBtn.textContent = i18next.t('returnHome');
          homeBtn.onclick = () => {
            localStorage.removeItem('tournamentAliases');
            location.hash = '/home';
          };

          const newTournamentBtn = document.createElement('button');
          newTournamentBtn.className = 'action-btn';
          newTournamentBtn.textContent = i18next.t('newTournament');
          newTournamentBtn.onclick = () => {
            localStorage.removeItem('tournamentAliases');
            location.reload();
          };

          display.appendChild(homeBtn);
          display.appendChild(newTournamentBtn);
        });

        display.appendChild(winnerBtn);
      } else {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'action-btn';
        nextBtn.textContent = i18next.t('nextRound');
        nextBtn.style.marginTop = '20px';

        nextBtn.addEventListener('click', async () => {
          const res = await apiFetch('/api/tournament/next-round', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ round: currentRound })
});

          const data = await res.json();
          if (!res.ok) return;

          currentRound += 1;
          localStorage.setItem('tournamentCurrentRound', currentRound.toString());
          showMatches(data.matches);
        });

        display.appendChild(nextBtn);
      }
    }
  }

  return container;
}