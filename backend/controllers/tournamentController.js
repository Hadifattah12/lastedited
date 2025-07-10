let currentMatches = [];
let winners = {};

const startTournament = async (request, reply) => {
  const { aliases } = request.body;
  if (!Array.isArray(aliases) || aliases.length < 2 || aliases.length % 2 !== 0)
    return reply.status(400).send({ error: 'Even number of players required' });

  const shuffled = aliases.sort(() => Math.random() - 0.5);
  currentMatches = [];
  winners = {};

  for (let i = 0; i < shuffled.length; i += 2) {
    currentMatches.push({
      id: i / 2 + 1,
      player1: shuffled[i],
      player2: shuffled[i + 1],
      round: 1,
      winner: null
    });
  }

  return reply.send({ matches: currentMatches });
};

const recordWinner = (request, reply) => {
  const { matchId, winner, round } = request.body;
  const match = currentMatches.find(m => m.id === matchId && m.round === round);
  if (!match) return reply.status(404).send({ error: 'Match not found' });

  match.winner = winner;
  if (!winners[round]) winners[round] = [];
  winners[round].push(winner);

  return reply.send({ message: 'Winner recorded' });
};

const nextRound = (request, reply) => {
  const round = request.body.round;
  const currentWinners = winners[round];
  if (!currentWinners || currentWinners.length < 2)
    return reply.status(400).send({ error: 'Not enough winners' });

  const nextMatches = [];
  for (let i = 0; i < currentWinners.length; i += 2) {
    nextMatches.push({
      id: i / 2 + 1,
      player1: currentWinners[i],
      player2: currentWinners[i + 1],
      round: round + 1,
      winner: null
    });
  }

  currentMatches = nextMatches;
  return reply.send({ matches: nextMatches });
};

const getMatches = (request, reply) => {
  return reply.send({ matches: currentMatches });
};

module.exports = { startTournament, recordWinner, nextRound, getMatches };