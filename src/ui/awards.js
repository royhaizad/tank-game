// Session awards ("fun facts") derived from the Win/Kill/Death tallies in
// src/main.js, per GAME_SPEC.md section 9.3. Pure computation — this file
// draws nothing and knows nothing about custom names; it reports slot
// labels and src/ui/menu.js resolves those for display.
//
// Every award is judged across the whole session, not a single match, so
// titles accumulate meaning as the night goes on. Each one is deliberately
// guarded so it only appears when it actually says something: an award
// every tank qualifies for (everyone on 0 kills at session start) is noise,
// not a fact.
class Awards {
  // Order here is the priority order — the Result screen shows only the
  // first few that apply (GAME_SPEC.md section 9.3), so the rarer, funnier
  // ones outrank the routine ones. Team Killer beats Pacifist every time.
  static DEFINITIONS = [
    {
      id: 'teamKiller',
      title: 'Team Killer',
      tooltip: 'Destroyed the most teammates. Friendly fire is on, and so are they.',
      pick: (rows) => Awards._maxBy(rows, (r) => r.teamKills, 1)
    },
    {
      id: 'ownGoal',
      title: 'Own Goal Enthusiast',
      tooltip: 'Blown up by their own ricochet more than anyone else. The wall always wins.',
      pick: (rows) => Awards._maxBy(rows, (r) => r.selfKills, 1)
    },
    {
      id: 'untouchable',
      title: 'Untouchable',
      tooltip: 'Has not been destroyed once all session. Suspiciously good at hiding, or just that good.',
      pick: (rows) => (rows.length < 2 ? [] : rows.filter((r) => r.deaths === 0 && (r.kills > 0 || r.wins > 0)))
    },
    {
      id: 'champion',
      title: 'Champion',
      tooltip: 'Won more matches than anyone else this session.',
      pick: (rows) => Awards._maxBy(rows, (r) => r.wins, 1)
    },
    {
      id: 'mostDeadly',
      title: 'Most Deadly',
      tooltip: 'Destroyed more tanks than anyone else this session.',
      pick: (rows) => Awards._maxBy(rows, (r) => r.kills, 1)
    },
    {
      id: 'sharpshooter',
      title: 'Sharpshooter',
      tooltip: 'Best kill-to-death ratio. Makes every shot count.',
      pick: (rows) => {
        const scoring = rows.filter((r) => r.kills > 0);
        if (rows.length < 2 || scoring.length === 0) return [];
        return Awards._maxBy(scoring, Awards._ratio);
      }
    },
    {
      id: 'victim',
      title: 'Victim of the Situation',
      tooltip: 'Destroyed more times than anyone else. Not necessarily their fault.',
      pick: (rows) => Awards._maxBy(rows, (r) => r.deaths, 1)
    },
    {
      id: 'cannonFodder',
      title: 'Cannon Fodder',
      tooltip: 'Worst kill-to-death ratio. Mostly target practice for everyone else.',
      pick: (rows) => {
        const dying = rows.filter((r) => r.deaths > 0);
        if (rows.length < 2 || dying.length === 0) return [];
        return Awards._minBy(dying, Awards._ratio);
      }
    },
    {
      id: 'glassCannon',
      title: 'Glass Cannon',
      tooltip: 'Hands out damage and takes just as much. No brakes, no regrets.',
      pick: (rows) => {
        if (rows.length < 3) return [];
        const avgKills = Awards._average(rows, (r) => r.kills);
        const avgDeaths = Awards._average(rows, (r) => r.deaths);
        const picked = rows.filter((r) => r.kills > avgKills && r.deaths > avgDeaths);
        return picked.length === rows.length ? [] : picked;
      }
    },
    {
      id: 'pacifist',
      title: 'Pacifist',
      tooltip: 'Went the entire session without destroying a single tank.',
      pick: (rows) => {
        // Only interesting once somebody has actually scored — otherwise
        // it's just "nobody has played yet".
        if (!rows.some((r) => r.kills > 0)) return [];
        return rows.filter((r) => r.kills === 0);
      }
    },
    {
      id: 'participation',
      title: 'Participation Trophy',
      tooltip: 'Turned up to every match. Won exactly none of them.',
      pick: (rows) => {
        if (!rows.some((r) => r.wins > 0)) return [];
        return rows.filter((r) => r.wins === 0 && (r.kills > 0 || r.deaths > 0));
      }
    },
    {
      id: 'wallflower',
      title: 'Wallflower',
      tooltip: 'Barely killed, barely died. Was present, technically.',
      pick: (rows) => {
        if (rows.length < 3) return [];
        const avgKills = Awards._average(rows, (r) => r.kills);
        const avgDeaths = Awards._average(rows, (r) => r.deaths);
        const picked = rows.filter((r) => r.kills < avgKills && r.deaths < avgDeaths);
        return picked.length === rows.length ? [] : picked;
      }
    }
  ];

  // stats: label -> { kills, deaths, wins, selfKills, teamKills } from
  // src/main.js. Returns [{ id, title, tooltip, holders: [label, ...] }] in
  // priority order, holding only the awards that currently apply. Each
  // award names exactly one tank — a real tie (two tanks level on the same
  // value) suppresses the award entirely rather than crediting either one,
  // since only one name can headline it.
  static compute(stats) {
    const rows = Object.keys(stats).map((label) => ({ label, ...stats[label] }));
    if (rows.length === 0) return [];
    // Nothing has happened yet, so nothing is worth saying about anyone.
    if (!rows.some((r) => r.kills > 0 || r.deaths > 0 || r.wins > 0)) return [];

    return Awards.DEFINITIONS.map((definition) => ({
      id: definition.id,
      title: definition.title,
      tooltip: definition.tooltip,
      holders: definition.pick(rows).map((row) => row.label)
    })).filter((award) => award.holders.length === 1);
  }

  // Deaths of 0 would divide by zero, so an unkilled tank is ranked on its
  // kill count alone — which is exactly the ordering you'd want anyway.
  static _ratio(row) {
    return row.deaths === 0 ? row.kills : row.kills / row.deaths;
  }

  static _average(rows, valueOf) {
    return rows.reduce((total, row) => total + valueOf(row), 0) / rows.length;
  }

  // `minimum` guards against awarding "most kills" to a table full of
  // zeroes; omit it for ratio-style values that can legitimately be low.
  static _maxBy(rows, valueOf, minimum) {
    const best = Math.max(...rows.map(valueOf));
    if (minimum !== undefined && best < minimum) return [];
    return rows.filter((row) => valueOf(row) === best);
  }

  static _minBy(rows, valueOf) {
    const worst = Math.min(...rows.map(valueOf));
    return rows.filter((row) => valueOf(row) === worst);
  }
}
