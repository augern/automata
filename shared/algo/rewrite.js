// Grammar transformations: cleanup (unproductive/unreachable), ε-elimination,
// unit-production elimination, Chomsky Normal Form, left-recursion
// elimination and Greibach Normal Form. No DOM access.
//
// Each computeXSteps(g) takes a grammar { rules, start, nts } (see
// parseGrammarRaw) and returns the list of steps the tool animates. The final
// step's grammarAfter is the transformed grammar. Steps are
//   { phase, html, isPhase, grammarAfter, newRules, activeRules }
// where `html` is a pre-built explanation fragment (symbols are escaped with
// esc()), phase is a plain-text-or-markup header, grammarAfter is a cloned
// rules array, and newRules/activeRules are indices into grammarAfter.
// Depends on grammar.js (EPSILON, esc, parseBNF).

// Parse without augmentation; returns { rules, start, nts }.
function parseGrammarRaw(text) {
  const g = parseBNF(text, false);
  return { rules: g.rules, start: g.start, nts: g.nonterminals, notes: g.notes };
}

// HTML-safe: every use of ruleStr is inside step-log HTML.
function ruleStr(r) { return esc(r.lhs) + ' → ' + (r.rhs.length ? esc(r.rhs.join(' ')) : EPSILON); }
function cloneRules(rules) { return rules.map(r => ({ lhs: r.lhs, rhs: [...r.rhs] })); }

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GRAMMAR CLEANUP
// Phase 1: remove rules containing unproductive nonterminals
//          (bottom-up fixpoint — no outer loop needed)
// Phase 2: remove rules whose LHS is unreachable from start
//          (BFS — single pass after Phase 1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function computeCleanupSteps(g) {
  const steps = [];
  let rules = cloneRules(g.rules);
  const start = g.start;

  steps.push({
    phase: 'Overview',
    html:  'Two phases: (1) remove rules referencing <em>unproductive</em> nonterminals'
         + ' (those that can never derive a string of terminals),'
         + ' then (2) remove rules whose LHS is <em>unreachable</em> from the start symbol.',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  // ── Phase 1: productive symbols ────────────────────────────
  steps.push({
    phase: 'Phase 1 — Productive symbols',
    html:  'A symbol is <em>productive</em> if it can derive a string of terminals.'
         + ' All terminals are productive. A nonterminal is productive if it has a rule'
         + ' where every RHS symbol is productive (ε-productions count immediately).',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  const allNTs = new Set(rules.map(r => r.lhs));
  const prod   = new Set();

  // Seed with all terminals that appear in any RHS
  for (const r of rules) for (const s of r.rhs) if (!allNTs.has(s)) prod.add(s);

  steps.push({
    phase: '',
    html:  'Terminals (productive by definition): '
         + (prod.size ? [...prod].map(s => '<span class="lg-hl">' + esc(s) + '</span>').join(' ')
                      : '<span class="lg-dim">none</span>'),
    isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  // Fixpoint: each iteration may add multiple NTs, show each one
  let changed = true;
  while (changed) {
    changed = false;
    for (const r of rules) {
      if (!prod.has(r.lhs) && r.rhs.every(s => prod.has(s))) {
        prod.add(r.lhs);
        changed = true;
        const rhsDesc = r.rhs.length === 0
          ? 'ε-production'
          : 'all RHS symbols productive';
        steps.push({
          phase: '',
          html:  '<span class="lg-hl">' + ruleStr(r) + '</span> — '
               + rhsDesc + ' → <span class="lg-new">' + esc(r.lhs) + '</span> is productive',
          isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
        });
      }
    }
  }

  const unprod = new Set([...allNTs].filter(nt => !prod.has(nt)));

  if (unprod.size === 0) {
    steps.push({
      phase: '',
      html:  'All nonterminals are productive — nothing to remove in this phase.',
      isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
    });
  } else {
    steps.push({
      phase: '',
      html:  'Unproductive nonterminals: '
           + [...unprod].map(s => '<span class="lg-del">' + esc(s) + '</span>').join(' '),
      isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
    });

    // Remove every rule that has an unproductive NT in LHS or RHS
    const rmIdx = [];
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      if (unprod.has(r.lhs) || r.rhs.some(s => unprod.has(s))) rmIdx.push(i);
    }
    if (rmIdx.length) {
      const rmSet = new Set(rmIdx);
      const removedHtml = rmIdx.map(i => '<span class="lg-del">' + ruleStr(rules[i]) + '</span>').join(', ');
      rules = rules.filter((_, i) => !rmSet.has(i));
      steps.push({
        phase: '',
        html:  'Removing rules that reference unproductive symbols: ' + removedHtml,
        isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
      });
    }
  }

  // ── Phase 2: reachable symbols ─────────────────────────────
  steps.push({
    phase: 'Phase 2 — Reachable symbols',
    html:  'A nonterminal is <em>reachable</em> if it can appear in a sentential form'
         + ' derived from the start symbol <span class="lg-hl">' + esc(start) + '</span>.'
         + ' Reachable nonterminals are found by breadth-first search.',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  const remainingNTs = new Set(rules.map(r => r.lhs));
  const reachable    = new Set();
  const queue        = [];

  if (remainingNTs.has(start)) {
    reachable.add(start);
    queue.push(start);
    steps.push({
      phase: '',
      html:  '<span class="lg-new">' + esc(start) + '</span> is reachable (start symbol).',
      isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
    });
  }

  while (queue.length) {
    const A = queue.shift();
    for (const r of rules) {
      if (r.lhs !== A) continue;
      for (const s of r.rhs) {
        if (remainingNTs.has(s) && !reachable.has(s)) {
          reachable.add(s);
          queue.push(s);
          steps.push({
            phase: '',
            html:  'Via <span class="lg-hl">' + ruleStr(r) + '</span>'
                 + ' → <span class="lg-new">' + esc(s) + '</span> is reachable.',
            isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
          });
        }
      }
    }
  }

  const unreachable = new Set([...remainingNTs].filter(nt => !reachable.has(nt)));

  if (unreachable.size === 0) {
    steps.push({
      phase: '',
      html:  'All nonterminals are reachable — nothing to remove in this phase.',
      isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
    });
  } else {
    steps.push({
      phase: '',
      html:  'Unreachable nonterminals: '
           + [...unreachable].map(s => '<span class="lg-del">' + esc(s) + '</span>').join(' '),
      isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
    });

    const rmIdx2 = [];
    for (let i = 0; i < rules.length; i++) {
      if (unreachable.has(rules[i].lhs)) rmIdx2.push(i);
    }
    if (rmIdx2.length) {
      const rmSet2 = new Set(rmIdx2);
      const removedHtml2 = rmIdx2.map(i => '<span class="lg-del">' + ruleStr(rules[i]) + '</span>').join(', ');
      rules = rules.filter((_, i) => !rmSet2.has(i));
      steps.push({
        phase: '',
        html:  'Removing unreachable rules: ' + removedHtml2,
        isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
      });
    }
  }

  // ── Done ──────────────────────────────────────────────────
  steps.push({
    phase: 'Done',
    html:  (unprod.size === 0 && unreachable.size === 0)
      ? 'Grammar is already clean — no unproductive or unreachable rules found.'
      : 'Grammar cleanup complete. The result contains only productive and reachable rules.',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  return steps;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ε-PRODUCTION ELIMINATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function computeEpsSteps(g) {
  const steps = [];
  let rules = cloneRules(g.rules);
  const nts = g.nts;

  // ── Phase 1: compute nullable set ────────────────────────
  const nullable = new Set();
  for (const r of rules) if (r.rhs.length === 0) nullable.add(r.lhs);
  let ch = true;
  while (ch) {
    ch = false;
    for (const r of rules) {
      if (!nullable.has(r.lhs) && r.rhs.length > 0 && r.rhs.every(s => nullable.has(s))) {
        nullable.add(r.lhs); ch = true;
      }
    }
  }

  const nbHtml = [...nullable].map(n => '<span class="ui-badge ui-badge--accept">' + esc(n) + '</span>').join(' ');
  steps.push({
    phase: 'Phase 1 — Nullable set',
    html:  nullable.size
      ? 'Nullable symbols: ' + nbHtml
      : 'No nullable symbols. Grammar has no ε-productions.',
    isPhase: true,
    grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  if (nullable.size === 0) {
    steps.push({ phase: '', html: 'Nothing to do — grammar unchanged.', isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
    return steps;
  }

  // ── Phase 2: add ε-closure productions ───────────────────
  steps.push({
    phase: 'Phase 2 — Add ε-closure productions',
    html:  'For every rule with nullable symbols in the RHS, add all non-empty subsets (omitting nullable symbols in every combination).',
    isPhase: true,
    grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  const seen = new Set(rules.map(r => r.lhs + '\0' + r.rhs.join(' ')));

  for (let ri = 0; ri < rules.length; ri++) {
    const r = rules[ri];
    if (r.rhs.length === 0) continue;

    const nullPos = r.rhs.map((s, i) => nullable.has(s) ? i : -1).filter(i => i >= 0);
    if (!nullPos.length) continue;

    const added = [];
    const total = 1 << nullPos.length;
    for (let mask = 0; mask < total - 1; mask++) { // exclude all-bits-set = original
      const newRhs = r.rhs.filter((s, i) => {
        const pi = nullPos.indexOf(i);
        return pi === -1 || !!((mask >> pi) & 1);
      });
      if (newRhs.length === 0) continue; // don't add ε here; Phase 3 may keep one
      const key = r.lhs + '\0' + newRhs.join(' ');
      if (seen.has(key)) continue;
      seen.add(key);
      added.push({ lhs: r.lhs, rhs: newRhs });
    }

    if (added.length) {
      rules = [...rules.slice(0, ri + 1), ...added, ...rules.slice(ri + 1)];
      const newIs = added.map((_, k) => ri + 1 + k);
      const nullSyms = nullPos.map(i => '<span class="ui-badge ui-badge--accept">' + esc(r.rhs[i]) + '</span>').join('');
      steps.push({
        phase: '',
        html: '<span class="lg-hl">' + ruleStr(r) + '</span> contains nullable ' + nullSyms
          + ' → adding: ' + added.map(a => '<span class="lg-new">' + ruleStr(a) + '</span>').join(', '),
        grammarAfter: cloneRules(rules),
        newRules: newIs, activeRules: [ri],
      });
    }
  }

  // ── Phase 3: remove ε-productions ────────────────────────
  const startNullable = nullable.has(g.start);
  steps.push({
    phase: 'Phase 3 — Remove ε-productions',
    html:  'Remove all A → ε'
      + (startNullable
        ? ', but keep <span class="lg-hl">' + esc(g.start) + ' → ε</span> (start symbol is nullable — language contains ε).'
        : '.'),
    isPhase: true,
    grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  const toRemove = [];
  let startKept = false;
  for (let i = 0; i < rules.length; i++) {
    if (rules[i].rhs.length === 0) {
      if (rules[i].lhs === g.start && startNullable && !startKept) { startKept = true; }
      else toRemove.push(i);
    }
  }

  if (toRemove.length) {
    const rmSet = new Set(toRemove);
    const removedHtml = toRemove.map(i => '<span class="lg-del">' + ruleStr(rules[i]) + '</span>').join(', ');
    rules = rules.filter((_, i) => !rmSet.has(i));
    steps.push({
      phase: '', html: 'Removing: ' + removedHtml,
      grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
    });
  } else {
    steps.push({ phase: '', html: 'No ε-productions to remove.', isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
  }

  // The start symbol can be nullable without having a direct S → ε rule
  // (e.g. S → A B with A, B nullable); then there is nothing to "keep", so add it.
  if (startNullable && !rules.some(r => r.lhs === g.start && r.rhs.length === 0)) {
    rules = [...rules, { lhs: g.start, rhs: [] }];
    steps.push({
      phase: '', isPhase: false,
      html: 'The start symbol is nullable but has no direct ε-rule, so add <span class="lg-new">' + esc(g.start) + ' → ε</span> to keep ε in the language.',
      grammarAfter: cloneRules(rules), newRules: [rules.length - 1], activeRules: [],
    });
  }

  // Done
  steps.push({
    phase: 'Done',
    html:  'ε-elimination complete.'
      + (startNullable ? ' <span class="lg-dim">(' + esc(g.start) + ' → ε retained.)</span>' : ''),
    isPhase: true,
    grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  return steps;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UNIT PRODUCTION ELIMINATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function computeUnitSteps(g) {
  const steps = [];
  let rules = cloneRules(g.rules);
  const nts = g.nts;

  function isUnit(r) { return r.rhs.length === 1 && nts.has(r.rhs[0]); }

  if (!rules.some(isUnit)) {
    steps.push({ phase: '', html: 'No unit productions found. Grammar unchanged.', isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
    return steps;
  }

  // ── Phase 1: unit pairs ───────────────────────────────────
  steps.push({
    phase: 'Phase 1 — Compute unit pairs',
    html:  'A <em>unit pair</em> (A, B) means A ⇒* B using only unit productions. Start with each (A, A).',
    isPhase: true,
    grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  const unitPairs = new Map();
  for (const nt of nts) unitPairs.set(nt, new Set([nt]));

  let ch = true;
  while (ch) {
    ch = false;
    for (const r of rules) {
      if (!isUnit(r)) continue;
      const A = r.lhs, B = r.rhs[0];
      const aSet = unitPairs.get(A);
      for (const C of unitPairs.get(B)) {
        if (!aSet.has(C)) { aSet.add(C); ch = true; }
      }
    }
  }

  const pairLines = [];
  for (const [A, bs] of unitPairs) {
    const others = [...bs].filter(b => b !== A);
    if (others.length)
      pairLines.push('<span class="ui-badge ui-badge--active">' + esc(A) + '</span> ⇒ ' + others.map(b => '<span class="ui-badge ui-badge--active">' + esc(b) + '</span>').join(', '));
  }
  steps.push({
    phase: '',
    html: pairLines.length ? 'Pairs (beyond identity): ' + pairLines.join(' &ensp; ') : 'No non-trivial unit pairs.',
    isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  // ── Phase 2: add productions via pairs ────────────────────
  steps.push({
    phase: 'Phase 2 — Copy productions through pairs',
    html:  'For each pair (A, B) with A ≠ B and each non-unit production B → α, add A → α.',
    isPhase: true,
    grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  const seen = new Set(rules.map(r => r.lhs + '\0' + r.rhs.join(' ')));

  for (const [A, bs] of unitPairs) {
    for (const B of bs) {
      if (B === A) continue;
      const bProds = rules.filter(r => r.lhs === B && !isUnit(r));
      for (const bp of bProds) {
        const key = A + '\0' + bp.rhs.join(' ');
        if (seen.has(key)) continue;
        seen.add(key);
        const nr = { lhs: A, rhs: [...bp.rhs] };
        // Find source rule index (may have shifted, so search)
        const srcIdx = rules.findIndex(r => r.lhs === B && r.rhs.join(' ') === bp.rhs.join(' '));
        // Insert after the last existing rule for A, keeping rules grouped by LHS
        let insertAfter = rules.reduce((last, r, i) => r.lhs === A ? i : last, -1);
        if (insertAfter === -1) insertAfter = rules.length - 1;
        rules = [...rules.slice(0, insertAfter + 1), nr, ...rules.slice(insertAfter + 1)];
        const ni = insertAfter + 1;
        steps.push({
          phase: '',
          html: 'Pair (<span class="ui-badge ui-badge--active">' + esc(A) + '</span>, <span class="ui-badge ui-badge--active">' + esc(B) + '</span>)'
            + ': copying <span class="lg-dim">' + ruleStr(bp) + '</span>'
            + ' → add <span class="lg-new">' + ruleStr(nr) + '</span>',
          grammarAfter: cloneRules(rules),
          newRules: [ni],
          activeRules: srcIdx >= 0 ? [srcIdx] : [],
        });
      }
    }
  }

  // ── Phase 3: remove unit productions ─────────────────────
  steps.push({
    phase: 'Phase 3 — Remove unit productions',
    html:  'Delete all rules of the form A → B.',
    isPhase: true,
    grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  const toRemove = rules.map((r, i) => isUnit(r) ? i : -1).filter(i => i >= 0);
  if (toRemove.length) {
    const rmSet = new Set(toRemove);
    const removedHtml = toRemove.map(i => '<span class="lg-del">' + ruleStr(rules[i]) + '</span>').join(', ');
    rules = rules.filter((_, i) => !rmSet.has(i));
    steps.push({ phase: '', html: 'Removing: ' + removedHtml, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
  } else {
    steps.push({ phase: '', html: 'No unit productions remain.', isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
  }

  steps.push({
    phase: 'Done',
    html: 'Unit production elimination complete.',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  return steps;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CNF CONVERSION
// Performs: (1) cleanup, (2) ε-elim, (3) unit elim,
//           (4) terminal isolation, (5) binarisation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function computeCNFSteps(g) {
  const steps = [];
  let rules   = cloneRules(g.rules);
  let nts     = new Set(g.nts);
  const start = g.start;

  steps.push({
    phase: 'Overview',
    html:  'Five phases: (1) clean up unproductive/unreachable rules, (2) eliminate ε-productions, (3) eliminate unit productions, (4) isolate terminals, (5) binarise long rules.',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  // ──────────────────────────────────────────────────────────
  // Phase 1: cleanup
  // ──────────────────────────────────────────────────────────
  steps.push({
    phase: 'Phase 1 — Cleanup',
    html:  'Remove rules that reference <em>unproductive</em> nonterminals (those that can never derive terminals), then remove <em>unreachable</em> rules.',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  {
    // Productive symbols — bottom-up fixpoint
    const allNTs1 = new Set(rules.map(r => r.lhs));
    const prod1   = new Set();
    for (const r of rules) for (const s of r.rhs) if (!allNTs1.has(s)) prod1.add(s);
    let ch1 = true;
    while (ch1) {
      ch1 = false;
      for (const r of rules) {
        if (!prod1.has(r.lhs) && r.rhs.every(s => prod1.has(s))) {
          prod1.add(r.lhs); ch1 = true;
          steps.push({
            phase: '', isPhase: false,
            html: '<span class="lg-hl">' + ruleStr(r) + '</span> — '
                + (r.rhs.length === 0 ? 'ε-production' : 'all RHS symbols productive')
                + ' → <span class="lg-new">' + esc(r.lhs) + '</span> is productive',
            grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
          });
        }
      }
    }
    const unprod1 = new Set([...allNTs1].filter(nt => !prod1.has(nt)));
    if (unprod1.size === 0) {
      steps.push({ phase: '', html: 'All nonterminals are productive — nothing to remove.', isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
    } else {
      const rmUI = rules.map((r, i) => (unprod1.has(r.lhs) || r.rhs.some(s => unprod1.has(s))) ? i : -1).filter(i => i >= 0);
      const rmHtmlU = rmUI.map(i => '<span class="lg-del">' + ruleStr(rules[i]) + '</span>').join(', ');
      rules = rules.filter((_, i) => !new Set(rmUI).has(i));
      nts = new Set(rules.map(r => r.lhs));
      steps.push({
        phase: '', isPhase: false,
        html: 'Unproductive: ' + [...unprod1].map(s => '<span class="lg-del">' + esc(s) + '</span>').join(' ')
            + ' — removing: ' + rmHtmlU,
        grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
      });
    }

    // Reachable symbols — BFS from start
    const remNTs1 = new Set(rules.map(r => r.lhs));
    const reach1  = new Set();
    const q1      = [];
    if (remNTs1.has(start)) { reach1.add(start); q1.push(start); }
    while (q1.length) {
      const A = q1.shift();
      for (const r of rules) {
        if (r.lhs !== A) continue;
        for (const s of r.rhs) if (remNTs1.has(s) && !reach1.has(s)) { reach1.add(s); q1.push(s); }
      }
    }
    const unreach1 = new Set([...remNTs1].filter(nt => !reach1.has(nt)));
    if (unreach1.size === 0) {
      steps.push({ phase: '', html: 'All nonterminals are reachable — nothing to remove.', isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
    } else {
      const rmRI = rules.map((r, i) => unreach1.has(r.lhs) ? i : -1).filter(i => i >= 0);
      const rmHtmlR = rmRI.map(i => '<span class="lg-del">' + ruleStr(rules[i]) + '</span>').join(', ');
      rules = rules.filter((_, i) => !new Set(rmRI).has(i));
      nts = new Set(rules.map(r => r.lhs));
      steps.push({
        phase: '', isPhase: false,
        html: 'Unreachable: ' + [...unreach1].map(s => '<span class="lg-del">' + esc(s) + '</span>').join(' ')
            + ' — removing: ' + rmHtmlR,
        grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
      });
    }
  }

  // ──────────────────────────────────────────────────────────
  // Phase 2: ε-elimination
  // ──────────────────────────────────────────────────────────
  steps.push({
    phase: 'Phase 2 — ε-Elimination',
    html:  'Remove ε-productions (retaining S → ε if the start symbol is nullable).',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  const nullable = new Set();
  for (const r of rules) if (r.rhs.length === 0) nullable.add(r.lhs);
  { let ch = true; while (ch) { ch = false; for (const r of rules) if (!nullable.has(r.lhs) && r.rhs.length > 0 && r.rhs.every(s => nullable.has(s))) { nullable.add(r.lhs); ch = true; } } }

  if (nullable.size === 0) {
    steps.push({ phase: '', html: 'No nullable symbols — skipping.', isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
  } else {
    steps.push({
      phase: '', isPhase: false,
      html: 'Nullable: ' + [...nullable].map(n => '<span class="ui-badge ui-badge--accept">' + esc(n) + '</span>').join(' '),
      grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
    });
    const seen1 = new Set(rules.map(r => r.lhs + '\0' + r.rhs.join(' ')));
    for (let ri = 0; ri < rules.length; ri++) {
      const r = rules[ri];
      if (r.rhs.length === 0) continue;
      const nPos = r.rhs.map((s, i) => nullable.has(s) ? i : -1).filter(i => i >= 0);
      if (!nPos.length) continue;
      const added = [];
      const total = 1 << nPos.length;
      for (let mask = 0; mask < total - 1; mask++) {
        const nr2 = r.rhs.filter((s, i) => { const p = nPos.indexOf(i); return p === -1 || !!((mask >> p) & 1); });
        if (!nr2.length) continue;
        const key = r.lhs + '\0' + nr2.join(' ');
        if (seen1.has(key)) continue;
        seen1.add(key);
        added.push({ lhs: r.lhs, rhs: nr2 });
      }
      if (added.length) {
        rules = [...rules.slice(0, ri + 1), ...added, ...rules.slice(ri + 1)];
        nts = new Set(rules.map(r => r.lhs));
        steps.push({
          phase: '', isPhase: false,
          html: '<span class="lg-hl">' + ruleStr(r) + '</span> → adding: ' + added.map(a => '<span class="lg-new">' + ruleStr(a) + '</span>').join(', '),
          grammarAfter: cloneRules(rules),
          newRules: added.map((_, k) => ri + 1 + k),
          activeRules: [ri],
        });
      }
    }
    // Remove ε-prods
    const rmEps = [];
    let sKept = false;
    for (let i = 0; i < rules.length; i++) {
      if (rules[i].rhs.length === 0) {
        if (rules[i].lhs === start && nullable.has(start) && !sKept) { sKept = true; }
        else rmEps.push(i);
      }
    }
    if (rmEps.length) {
      const rmSet = new Set(rmEps);
      const dHtml = rmEps.map(i => '<span class="lg-del">' + ruleStr(rules[i]) + '</span>').join(', ');
      rules = rules.filter((_, i) => !rmSet.has(i));
      nts = new Set(rules.map(r => r.lhs));
      steps.push({ phase: '', isPhase: false, html: 'Remove: ' + dHtml, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
    }
    // Nullable start without a direct S → ε rule: add it so ε stays in the language.
    if (nullable.has(start) && !rules.some(r => r.lhs === start && r.rhs.length === 0)) {
      rules = [...rules, { lhs: start, rhs: [] }];
      nts = new Set(rules.map(r => r.lhs));
      steps.push({
        phase: '', isPhase: false,
        html: 'Start symbol is nullable but has no direct ε-rule — add <span class="lg-new">' + esc(start) + ' → ε</span>.',
        grammarAfter: cloneRules(rules), newRules: [rules.length - 1], activeRules: [],
      });
    }
  }

  // ──────────────────────────────────────────────────────────
  // Phase 3: unit elimination
  // ──────────────────────────────────────────────────────────
  steps.push({
    phase: 'Phase 3 — Unit Elimination',
    html:  'Remove all unit productions A → B.',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  function isUnit2(r) { return r.rhs.length === 1 && nts.has(r.rhs[0]); }

  if (!rules.some(isUnit2)) {
    steps.push({ phase: '', html: 'No unit productions — skipping.', isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
  } else {
    const up = new Map();
    for (const nt of nts) up.set(nt, new Set([nt]));
    { let ch = true; while (ch) { ch = false; for (const r of rules) { if (!isUnit2(r)) continue; const A = r.lhs, B = r.rhs[0]; const aS = up.get(A); for (const C of up.get(B)) { if (!aS.has(C)) { aS.add(C); ch = true; } } } } }
    const seen2 = new Set(rules.map(r => r.lhs + '\0' + r.rhs.join(' ')));
    for (const [A, bs] of up) {
      for (const B of bs) {
        if (B === A) continue;
        for (const bp of rules.filter(r => r.lhs === B && !isUnit2(r))) {
          const key = A + '\0' + bp.rhs.join(' ');
          if (seen2.has(key)) continue;
          seen2.add(key);
          const nr = { lhs: A, rhs: [...bp.rhs] };
          const si = rules.findIndex(r => r.lhs === B && r.rhs.join(' ') === bp.rhs.join(' '));
          let insertAfter = rules.reduce((last, r, i) => r.lhs === A ? i : last, -1);
          if (insertAfter === -1) insertAfter = rules.length - 1;
          rules = [...rules.slice(0, insertAfter + 1), nr, ...rules.slice(insertAfter + 1)];
          const ni = insertAfter + 1;
          nts = new Set(rules.map(r => r.lhs));
          steps.push({ phase: '', isPhase: false, html: 'Pair (<span class="ui-badge ui-badge--active">'+esc(A)+'</span>,<span class="ui-badge ui-badge--active">'+esc(B)+'</span>): add <span class="lg-new">'+ruleStr(nr)+'</span>', grammarAfter: cloneRules(rules), newRules: [ni], activeRules: si >= 0 ? [si] : [] });
        }
      }
    }
    const rmU = rules.map((r, i) => isUnit2(r) ? i : -1).filter(i => i >= 0);
    if (rmU.length) {
      const rmSet = new Set(rmU);
      const dHtml = rmU.map(i => '<span class="lg-del">' + ruleStr(rules[i]) + '</span>').join(', ');
      rules = rules.filter((_, i) => !rmSet.has(i));
      nts = new Set(rules.map(r => r.lhs));
      steps.push({ phase: '', isPhase: false, html: 'Remove: ' + dHtml, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
    }
  }

  // ──────────────────────────────────────────────────────────
  // Phase 4: terminal isolation
  // ──────────────────────────────────────────────────────────
  steps.push({
    phase: 'Phase 4 — Terminal Isolation',
    html:  'In any rule with ≥ 2 RHS symbols, replace each terminal <em>t</em> with a fresh nonterminal Xₜ → t.',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  function toSub(n) { return String(n).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[+d]).join(''); }

  // Which terminals need wrapping?
  const termMap = new Map();
  function termNT(t) {
    if (termMap.has(t)) return termMap.get(t);
    let ctr = termMap.size + 1;
    let name = 'X' + toSub(ctr);
    while (nts.has(name)) name = 'X' + toSub(++ctr);
    nts.add(name);
    termMap.set(t, name);
    return name;
  }

  // Identify which rules need terminal isolation
  let termChanged = false;
  for (const r of rules) {
    if (r.rhs.length < 2) continue;
    for (const s of r.rhs) {
      if (!nts.has(s)) { termNT(s); termChanged = true; }
    }
  }

  if (!termChanged || termMap.size === 0) {
    steps.push({ phase: '', html: 'No terminals appear in rules with ≥ 2 symbols — skipping.', isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
  } else {
    // Add wrapper rules
    const wrappers = [...termMap.entries()].map(([t, nt]) => ({ lhs: nt, rhs: [t] }));
    const before = rules.length;
    rules = [...rules, ...wrappers];
    const wIs = wrappers.map((_, k) => before + k);
    steps.push({
      phase: '', isPhase: false,
      html: 'New wrapper rules: ' + wrappers.map(w => '<span class="lg-new">' + ruleStr(w) + '</span>').join(', '),
      grammarAfter: cloneRules(rules), newRules: wIs, activeRules: [],
    });

    // Rewrite original rules (not the wrappers)
    const modIs = [];
    for (let ri = 0; ri < before; ri++) {
      const r = rules[ri];
      if (r.rhs.length < 2) continue;
      const newRhs = r.rhs.map(s => {
        if (nts.has(s) && !termMap.has(s)) return s; // real NT, not a terminal key
        if (termMap.has(s)) return termMap.get(s);
        return s;
      });
      if (newRhs.some((s, i) => s !== r.rhs[i])) {
        rules[ri] = { lhs: r.lhs, rhs: newRhs };
        modIs.push(ri);
      }
    }
    if (modIs.length) {
      steps.push({
        phase: '', isPhase: false,
        html: 'Rewrite using wrappers: ' + modIs.map(i => '<span class="lg-hl">' + ruleStr(rules[i]) + '</span>').join(', '),
        grammarAfter: cloneRules(rules), newRules: [], activeRules: modIs,
      });
    }
  }

  // ──────────────────────────────────────────────────────────
  // Phase 5: binarisation
  // ──────────────────────────────────────────────────────────
  steps.push({
    phase: 'Phase 5 — Binarisation',
    html:  'Replace each rule A → B₁ B₂ … Bₙ (n ≥ 3) with A → B₁ Y, Y → B₂ … Bₙ using fresh nonterminals.',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  const freshCtrs = new Map();
  function freshNT(base) {
    const root = base.replace(/[₀₁₂₃₄₅₆₇₈₉]+$/, '');
    let ctr = freshCtrs.get(root) || 0;
    let name;
    do { name = root + toSub(++ctr); } while (nts.has(name));
    freshCtrs.set(root, ctr);
    nts.add(name);
    return name;
  }

  let anyBin = false;
  let safety = 0;
  while (true) {
    const li = rules.findIndex(r => r.rhs.length >= 3);
    if (li < 0) break;
    if (++safety > 500) break;
    anyBin = true;
    const r = rules[li];
    const newNT = freshNT(r.lhs);
    const nr1 = { lhs: r.lhs, rhs: [r.rhs[0], newNT] };
    const nr2 = { lhs: newNT, rhs: r.rhs.slice(1) };
    rules[li] = nr1;
    rules = [...rules.slice(0, li + 1), nr2, ...rules.slice(li + 1)];
    nts = new Set(rules.map(r => r.lhs));
    steps.push({
      phase: '', isPhase: false,
      html: '<span class="lg-del">' + ruleStr(r) + '</span> → <span class="lg-new">' + ruleStr(nr1) + '</span> + <span class="lg-new">' + ruleStr(nr2) + '</span>',
      grammarAfter: cloneRules(rules),
      newRules: [li, li + 1],
      activeRules: [],
    });
  }

  if (!anyBin) {
    steps.push({ phase: '', html: 'All rules already have ≤ 2 RHS symbols — skipping.', isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [] });
  }

  // ── Done ──────────────────────────────────────────────────
  const epsSuffix = nullable.has(start)
    ? ' <span class="lg-dim">(Plus ' + esc(start) + ' → ε since start is nullable.)</span>' : '';
  steps.push({
    phase: 'Done — Chomsky Normal Form',
    html:  'Every production is now A → BC or A → a.' + epsSuffix,
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  return steps;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LEFT-RECURSION ELIMINATION
// Standard two-pass algorithm (Dragon Book §4.3.3)
// Pass 1 (outer i-loop): for each Aᵢ, substitute any Aⱼ (j<i)
//   found at the head of an Aᵢ-rule with Aⱼ's current productions.
// Pass 2 (inner per-NT): eliminate direct left recursion by
//   introducing a fresh tail nonterminal Aᵢ′.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function computeLRESteps(g) {
  const steps = [];
  let rules = cloneRules(g.rules);

  // Order nonterminals by first appearance in rule list
  const nts = [];
  { const seen = new Set(); for (const r of rules) if (!seen.has(r.lhs)) { seen.add(r.lhs); nts.push(r.lhs); } }

  // Return the first name base + "'" + … not already used as a rule LHS
  function freshName(base) {
    const used = new Set(rules.map(r => r.lhs));
    let n = base + "'";
    while (used.has(n)) n += "'";
    return n;
  }

  const ntOrderHtml = nts.map((n, i) => 'A<sub>' + (i+1) + '</sub> = <span class="lg-hl">' + esc(n) + '</span>').join(', ');

  steps.push({
    phase: 'Overview',
    html:  'Order nonterminals A<sub>1</sub> … A<sub>n</sub> and process each in turn. '
         + 'For each A<sub>i</sub>: (1) substitute the current productions of any A<sub>j</sub> (j &lt; i) '
         + 'found at the head of an A<sub>i</sub>-rule; '
         + '(2) eliminate any remaining direct left recursion in A<sub>i</sub> '
         + 'by introducing a fresh tail nonterminal A<sub>i</sub>′.',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  steps.push({
    phase: '',
    html:  'Nonterminal order: ' + ntOrderHtml,
    isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  let anyChange = false;

  for (let i = 0; i < nts.length; i++) {
    const Ai = nts[i];

    steps.push({
      phase: 'A<sub>' + (i+1) + '</sub> = ' + esc(Ai),
      html:  'Processing <span class="lg-hl">' + esc(Ai) + '</span>.',
      isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
    });

    // ── Step 1: substitute Aⱼ (j < i) into Aᵢ → Aⱼ γ ──────
    for (let j = 0; j < i; j++) {
      const Aj = nts[j];
      const toReplace = rules.filter(r => r.lhs === Ai && r.rhs.length > 0 && r.rhs[0] === Aj);
      if (toReplace.length === 0) continue;

      const AjProds = rules.filter(r => r.lhs === Aj);
      const activeIdxs = toReplace.map(r => rules.indexOf(r));
      steps.push({
        phase: '',
        html:  (toReplace.length === 1 ? 'Rule ' : 'Rules ')
             + toReplace.map(r => '<span class="lg-hl">' + ruleStr(r) + '</span>').join(', ')
             + (toReplace.length === 1 ? ' starts' : ' start')
             + ' with <span class="lg-hl">' + esc(Aj) + '</span> — substituting its productions.',
        isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: activeIdxs,
      });

      const replaceSet = new Set(toReplace.map(r => rules.indexOf(r)));
      const generated  = [];
      for (const r of toReplace) {
        const gamma = r.rhs.slice(1);
        for (const ajr of AjProds) generated.push({ lhs: Ai, rhs: [...ajr.rhs, ...gamma] });
      }
      rules = rules.filter((_, idx) => !replaceSet.has(idx));
      const insertAt = rules.length;
      rules.push(...generated);

      steps.push({
        phase: '',
        html:  'Removed: ' + toReplace.map(r => '<span class="lg-del">' + ruleStr(r) + '</span>').join(', ')
             + '<br>Added:&nbsp; ' + generated.map(r => '<span class="lg-new">' + ruleStr(r) + '</span>').join(', '),
        isPhase: false, grammarAfter: cloneRules(rules),
        newRules: generated.map((_, k) => insertAt + k), activeRules: [],
      });
      anyChange = true;
    }

    // ── Step 2: eliminate direct left recursion in Aᵢ ───────
    const lrRules    = rules.filter(r => r.lhs === Ai && r.rhs.length > 0 && r.rhs[0] === Ai);
    const nonLrRules = rules.filter(r => r.lhs === Ai && !(r.rhs.length > 0 && r.rhs[0] === Ai));

    if (lrRules.length === 0) {
      steps.push({
        phase: '',
        html:  '<span class="lg-hl">' + esc(Ai) + '</span> has no direct left recursion — skipping.',
        isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
      });
      continue;
    }

    anyChange = true;
    const activeIdxs2 = rules.map((r, idx) => r.lhs === Ai ? idx : -1).filter(idx => idx >= 0);
    steps.push({
      phase: '',
      html:  'Direct left recursion in <span class="lg-hl">' + esc(Ai) + '</span>:<br>'
           + 'Left-recursive:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'
           + lrRules.map(r => '<span class="lg-hl">' + ruleStr(r) + '</span>').join(', ') + '<br>'
           + 'Non-left-recursive: '
           + (nonLrRules.length
               ? nonLrRules.map(r => '<span class="lg-hl">' + ruleStr(r) + '</span>').join(', ')
               : '<span class="lg-dim">none (language contribution of ' + esc(Ai) + ' is empty)</span>'),
      isPhase: false, grammarAfter: cloneRules(rules), newRules: [], activeRules: activeIdxs2,
    });

    const Ai_prime   = freshName(Ai);
    const newAiRules = nonLrRules.map(r => ({ lhs: Ai,       rhs: [...r.rhs, Ai_prime] }));
    const newTailRules = [
      ...lrRules.map(r => ({ lhs: Ai_prime, rhs: [...r.rhs.slice(1), Ai_prime] })),
      { lhs: Ai_prime, rhs: [] },
    ];

    rules = rules.filter(r => r.lhs !== Ai);
    const insertAt2 = rules.length;
    rules.push(...newAiRules, ...newTailRules);

    steps.push({
      phase: '',
      html:  'Introducing tail nonterminal <span class="lg-hl">' + esc(Ai_prime) + '</span>:<br>'
           + esc(Ai)       + ':&nbsp; ' + newAiRules.map(r   => '<span class="lg-new">' + ruleStr(r) + '</span>').join(', ') + '<br>'
           + esc(Ai_prime) + ':&nbsp; ' + newTailRules.map(r => '<span class="lg-new">' + ruleStr(r) + '</span>').join(', '),
      isPhase: false, grammarAfter: cloneRules(rules),
      newRules: [...newAiRules, ...newTailRules].map((_, k) => insertAt2 + k),
      activeRules: [],
    });
  }

  steps.push({
    phase: 'Done',
    html:  anyChange
      ? 'Left recursion eliminated. The result generates the same language and contains no left-recursive rules.'
      : 'No left recursion found — grammar is already left-recursion-free.',
    isPhase: true, grammarAfter: cloneRules(rules), newRules: [], activeRules: [],
  });

  return steps;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GREIBACH NORMAL FORM
// Every rule becomes A → a B₁ … Bₖ (a terminal, then nonterminals); S → ε is kept when the
// language contains ε. Performs: preparation (cleanup, ε-elimination, unit elimination), then
//   (1) order the nonterminals, (2) forward pass: substitute the earlier nonterminals into each
//   rule that starts with one, and remove direct left recursion with a tail nonterminal that,
//   unlike in the left-recursion tool, has no ε-rule, (3) back-substitution from the last
//   nonterminal up, (4) substitute into the tails, (5) isolate terminals that are not first,
//   (6) tidy up. The result can be much larger than the input, so the run stops at GNF_MAX_RULES.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const GNF_MAX_RULES = 300;

function gnfSub(n) { return String(n).split('').map(d => '₀₁₂₃₄₅₆₇₈₉'[+d]).join(''); }

function computeGNFSteps(g) {
  const steps = [];
  const start = g.start;
  let rules = cloneRules(g.rules);
  const ruleKey = r => r.lhs + '\0' + r.rhs.join('\0');
  const hl  = r => '<span class="lg-hl">' + ruleStr(r) + '</span>';
  const del = r => '<span class="lg-del">' + ruleStr(r) + '</span>';
  const add = r => '<span class="lg-new">' + ruleStr(r) + '</span>';
  const nm  = n => '<span class="lg-hl">' + esc(n) + '</span>';
  const push = (html, o = {}) => steps.push({
    phase: o.phase || '', html, isPhase: !!o.isPhase,
    grammarAfter: cloneRules(rules), newRules: o.newRules || [], activeRules: o.activeRules || [],
  });
  const ntSet = () => new Set(rules.map(r => r.lhs));

  push('Greibach normal form: every rule is A → a B₁ … Bₖ, a terminal followed by nonterminals. '
     + 'Six phases after a preparation: (1) order the nonterminals, (2) forward pass — substitute earlier nonterminals and remove direct left recursion, '
     + '(3) back-substitution, (4) substitute into the tail nonterminals, (5) isolate terminals that are not first, (6) tidy up.',
     { phase: 'Overview', isPhase: true });

  // ── Preparation: the grammar must be clean, ε-free (but for S → ε) and without unit rules ──
  for (const [label, fn] of [['Preparation 1 — Cleanup', computeCleanupSteps], ['Preparation 2 — ε-elimination', computeEpsSteps], ['Preparation 3 — Unit elimination', computeUnitSteps]]) {
    push('Run first, so the rest can assume it: ' + label.split(' — ')[1].toLowerCase() + '.', { phase: label, isPhase: true });
    const sub = fn({ rules: cloneRules(rules), start, nts: ntSet() });
    for (const st of sub) steps.push({ ...st, phase: st.phase ? label.split(' — ')[0] + ' · ' + st.phase : '' });
    rules = cloneRules(sub[sub.length - 1].grammarAfter);
  }

  if (!rules.some(r => r.lhs === start)) {
    push('The start symbol derives no string, so the language is empty and there is nothing to convert.', { phase: 'Done', isPhase: true });
    return steps;
  }

  const startEps = rules.some(r => r.lhs === start && r.rhs.length === 0);
  if (startEps) {
    rules = rules.filter(r => !(r.lhs === start && r.rhs.length === 0));
    push('The language contains ε. <span class="lg-hl">' + esc(start) + ' → ε</span> is set aside, kept as it is, and put back at the end; the transformation works on the ε-free rest.');
    if (!rules.length) {
      rules = [{ lhs: start, rhs: [] }];
      push('Nothing else is left: the language is {ε}, and ' + esc(start) + ' → ε is already in Greibach normal form.', { phase: 'Done', isPhase: true });
      return steps;
    }
  }

  const fresh = base => {
    const used = ntSet();
    let n = base + "'";
    while (used.has(n)) n += "'";
    return n;
  };

  // Replace every rule  owner → head γ  by  owner → δ γ  for each rule  head → δ.
  function substitute(owner, head) {
    const hit = rules.filter(r => r.lhs === owner && r.rhs[0] === head);
    if (!hit.length) return false;
    const prods = rules.filter(r => r.lhs === head);
    push((hit.length === 1 ? 'Rule ' : 'Rules ') + hit.map(hl).join(', ') + (hit.length === 1 ? ' starts' : ' start')
       + ' with ' + nm(head) + ' — substituting its productions.', { activeRules: hit.map(r => rules.indexOf(r)) });
    const hitSet = new Set(hit);
    const seen = new Set(rules.filter(r => !hitSet.has(r)).map(ruleKey));
    const made = [];
    for (const r of hit) for (const pr of prods) {
      const n = { lhs: owner, rhs: [...pr.rhs, ...r.rhs.slice(1)] };
      if (!seen.has(ruleKey(n))) { seen.add(ruleKey(n)); made.push(n); }
    }
    rules = rules.filter(r => !hitSet.has(r));
    const at = rules.length;
    rules.push(...made);
    push('Removed: ' + hit.map(del).join(', ') + '<br>Added:&nbsp; ' + (made.length ? made.map(add).join(', ') : '<span class="lg-dim">nothing new (all already present)</span>'),
         { newRules: made.map((_, k) => at + k) });
    if (rules.length > GNF_MAX_RULES) throw { gnfStop: true };
    return true;
  }

  try {
    // ── Phase 1: order ──
    const A = [];
    for (const r of [{ lhs: start }, ...rules]) if (!A.includes(r.lhs)) A.push(r.lhs);
    push('Number the nonterminals, the start symbol first: ' + A.map((n, i) => 'A<sub>' + (i + 1) + '</sub> = ' + nm(n)).join(', ')
       + '. The aim of the next phases: a rule of A<sub>i</sub> never starts with A<sub>j</sub> unless j &gt; i.', { phase: 'Phase 1 — Order the nonterminals', isPhase: true });

    // ── Phase 2: forward pass ──
    push('For i = 1 … n: substitute A<sub>j</sub> (j &lt; i) into the rules of A<sub>i</sub> that start with it, then remove direct left recursion A<sub>i</sub> → A<sub>i</sub> α with a tail nonterminal. '
       + 'The tail has no ε-rule here, so the grammar stays ε-free.', { phase: 'Phase 2 — Forward pass', isPhase: true });
    const tails = [];
    for (let i = 0; i < A.length; i++) {
      const Ai = A[i];
      push('Processing ' + nm(Ai) + ' (A<sub>' + (i + 1) + '</sub>).');
      for (let j = 0; j < i; j++) substitute(Ai, A[j]);
      const lr = rules.filter(r => r.lhs === Ai && r.rhs[0] === Ai);
      if (!lr.length) {
        push(nm(Ai) + ' has no direct left recursion — nothing to remove.');
        continue;
      }
      const base = rules.filter(r => r.lhs === Ai && r.rhs[0] !== Ai);
      push('Direct left recursion in ' + nm(Ai) + ':<br>Left-recursive: ' + lr.map(hl).join(', ') + '<br>Other rules: '
         + (base.length ? base.map(hl).join(', ') : '<span class="lg-dim">none</span>'),
         { activeRules: rules.map((r, k) => r.lhs === Ai ? k : -1).filter(k => k >= 0) });
      if (!base.length) {
        rules = rules.filter(r => r.lhs !== Ai);
        push(nm(Ai) + ' has no rule that does not start with itself, so it derives nothing: its rules are removed.');
        continue;
      }
      const B = fresh(Ai);
      const mine = [...base.flatMap(r => [{ lhs: Ai, rhs: [...r.rhs] }, { lhs: Ai, rhs: [...r.rhs, B] }]),
                    ...lr.flatMap(r => [{ lhs: B, rhs: r.rhs.slice(1) }, { lhs: B, rhs: [...r.rhs.slice(1), B] }])];
      rules = rules.filter(r => r.lhs !== Ai);
      const at = rules.length;
      rules.push(...mine);
      tails.push(B);
      push('Tail nonterminal ' + nm(B) + ' (no ε-rule): each other rule β gives A → β and A → β ' + esc(B) + '; each recursive A → A α gives ' + esc(B) + ' → α and ' + esc(B) + ' → α ' + esc(B) + '.<br>'
         + mine.map(add).join(', '), { newRules: mine.map((_, k) => at + k) });
      if (rules.length > GNF_MAX_RULES) throw { gnfStop: true };
    }

    // ── Phase 3: back-substitution ──
    push('Now the rules of A<sub>n</sub> all start with a terminal. Going from A<sub>n−1</sub> up to A<sub>1</sub>, substitute the later nonterminals into every rule that starts with one: '
       + 'each of those is already terminal-led, so the result is too.', { phase: 'Phase 3 — Back-substitution', isPhase: true });
    for (let i = A.length - 2; i >= 0; i--) {
      let any = false;
      for (let k = i + 1; k < A.length; k++) any = substitute(A[i], A[k]) || any;
      if (!any) push(nm(A[i]) + ': every rule already starts with a terminal.');
    }

    // ── Phase 4: the tails ──
    push('The tail nonterminals ' + (tails.length ? tails.map(nm).join(', ') : '(none were needed)') + ' can still have rules that start with some A<sub>j</sub>. Substitute those too.',
         { phase: 'Phase 4 — Substitute into the tails', isPhase: true });
    for (let round = 0; round < 20; round++) {
      let changed = false;
      for (const T of tails) {
        const heads = [...new Set(rules.filter(r => r.lhs === T && r.rhs.length && ntSet().has(r.rhs[0]) && r.rhs[0] !== T).map(r => r.rhs[0]))];
        for (const h of heads) changed = substitute(T, h) || changed;
      }
      if (!changed) break;
    }
    if (!tails.length) push('No tail nonterminals — nothing to do.');
    if (rules.some(r => r.rhs.length && ntSet().has(r.rhs[0]))) push('<span class="lg-del">A rule still starts with a nonterminal</span> — the result is not in Greibach normal form (internal error).');

    // ── Phase 5: terminals that are not first ──
    push('A rule A → a α needs α to consist of nonterminals only. Replace every terminal t that is not first by a fresh nonterminal Xₜ with the rule Xₜ → t.', { phase: 'Phase 5 — Isolate terminals', isPhase: true });
    {
      const names = ntSet();
      const wrap = new Map();
      const wrapper = t => {
        if (wrap.has(t)) return wrap.get(t);
        let c = wrap.size + 1, n = 'X' + gnfSub(c);
        while (names.has(n)) n = 'X' + gnfSub(++c);
        names.add(n);
        wrap.set(t, n);
        return n;
      };
      let touched = [];
      rules = rules.map(r => {
        if (r.rhs.length < 2) return r;
        const rhs = r.rhs.map((s, i) => (i > 0 && !names.has(s) ? wrapper(s) : s));
        if (rhs.every((s, i) => s === r.rhs[i])) return r;
        touched.push(r);
        return { lhs: r.lhs, rhs };
      });
      if (!wrap.size) push('No terminal stands behind another symbol — nothing to do.');
      else {
        const ws = [...wrap.entries()].map(([t, n]) => ({ lhs: n, rhs: [t] }));
        const at = rules.length;
        rules.push(...ws);
        push('Replaced terminals in ' + touched.length + (touched.length === 1 ? ' rule' : ' rules') + '. New rules: ' + ws.map(add).join(', '), { newRules: ws.map((_, k) => at + k) });
      }
    }

    // ── Phase 6: tidy ──
    push('Remove duplicate rules and the rules of nonterminals that can no longer be reached from the start symbol.', { phase: 'Phase 6 — Tidy up', isPhase: true });
    {
      const seen = new Set();
      const kept = rules.filter(r => { const k = ruleKey(r); if (seen.has(k)) return false; seen.add(k); return true; });
      if (kept.length < rules.length) { rules = kept; push('Removed ' + (seen.size ? '' : '') + 'duplicate rules.'); }
      const names = ntSet(), reach = new Set([start]), queue = [start];
      while (queue.length) {
        const n = queue.shift();
        for (const r of rules) if (r.lhs === n) for (const s of r.rhs) if (names.has(s) && !reach.has(s)) { reach.add(s); queue.push(s); }
      }
      const dead = rules.filter(r => !reach.has(r.lhs));
      if (dead.length) { rules = rules.filter(r => reach.has(r.lhs)); push('Unreachable: ' + dead.map(del).join(', ')); }
      else push('Nothing unreachable.');
    }
  } catch (e) {
    if (!e || !e.gnfStop) throw e;
    push('Stopped: the grammar grew beyond ' + GNF_MAX_RULES + ' rules. Substitution can make Greibach normal form exponentially larger than the original; the grammar shown is where it stopped, not a result.',
         { phase: 'Stopped', isPhase: true });
    return steps;
  }

  if (startEps) {
    rules.unshift({ lhs: start, rhs: [] });
    push('Put back ' + add(rules[0]) + '.' + (rules.some(r => r.rhs.includes(start))
        ? ' <span class="lg-dim">(Strictly, S → ε is allowed in Greibach normal form only when S appears on no right-hand side; here it does, so a new start symbol S₀ → S | ε would be needed.)</span>' : ''),
         { newRules: [0] });
  }
  push('Greibach normal form reached: ' + rules.length + ' rules, each A → a B₁ … Bₖ'
     + (startEps ? ', apart from ' + esc(start) + ' → ε' : '') + '. The language is unchanged.', { phase: 'Done', isPhase: true });
  return steps;
}
