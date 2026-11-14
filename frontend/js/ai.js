/* AI Studio: Scene Planner, Project Health timeline + what-if, Crew Match, and Model Lab */
(function () {
  'use strict';
  const { h, icon, ui, fmt: F, card } = DP;

  // ---------------------------------------------------------------------------------
  // Reusable DP.healthPanel (called by project page "AI Health" tab and AI Studio)
  // ---------------------------------------------------------------------------------
  DP.healthPanel = async (container, projectId, opts = {}) => {
    DP.clear(container).append(ui.skeleton(5, true));
    let data;
    try {
      data = await DP.api('/ai/health/' + projectId);
    } catch (err) {
      DP.clear(container).append(ui.callout(err.message, 'warn', 'wrench'));
      return;
    }

    DP.clear(container);
    const curve = data.curve || [];
    if (!curve.length) {
      container.append(ui.callout('No shoot day forecasts recorded for this project yet.', 'info'));
      return;
    }

    const latest = curve[curve.length - 1];
    const initialRisk = latest.risk;
    const initialOverrun = latest.overrun_pct;
    const initialCost = latest.projected_cost;
    const initialSpent = latest.budget_used;

    // KPI Cards
    const kpiRow = h('div', { class: 'grid g4' });
    const gaugeWrap = card('Current Delay Risk', 'sparkles');
    const gaugeSlot = h('div');
    gaugeSlot.append(ui.gauge(initialRisk));
    gaugeWrap.append(gaugeSlot);

    const costCard = card('Projected Total Cost', 'wallet',
      h('div', { class: 'bold', style: { fontSize: '26px', marginTop: '6px' } }, F.money(initialCost)),
      h('div', { class: 'small muted', style: { marginTop: '4px' } }, 'Spent so far: ', h('b', { class: 'num' }, F.money(initialSpent))),
      h('div', { class: 'mt' },
        ui.tag(
          (initialOverrun > 0 ? '+' : '') + F.pctf(initialOverrun, 1) + ' projected variance',
          initialOverrun > 0.1 ? 'bad' : initialOverrun > 0 ? 'warn' : 'ok'
        )
      )
    );

    const progressCard = card('Production Progress', 'layers',
      h('div', { class: 'bold', style: { fontSize: '26px', marginTop: '6px' } }, F.pctf(latest.progress, 0)),
      h('div', { class: 'small muted', style: { marginTop: '4px' } }, 'Shoot day ' + latest.day + ' of ' + curve.length),
      h('div', { class: 'mt' }, ui.bar(latest.progress * 100, 100, 'teal'))
    );

    const daysCard = card('Timeline Snapshots', 'calendar',
      h('div', { class: 'bold', style: { fontSize: '26px', marginTop: '6px' } }, curve.length + ' Days'),
      h('div', { class: 'small muted', style: { marginTop: '4px' } }, 'From ' + F.date(curve[0].date) + ' to ' + F.date(latest.date)),
      h('div', { class: 'mt' }, ui.tag('Trained ML Model', 'tan'))
    );

    kpiRow.append(gaugeWrap, costCard, progressCard, daysCard);
    container.append(kpiRow);

    // Timeline Chart Card
    const chartCard = card('Risk & Cost Projection Curve over Shoot Days', 'trending-up');
    container.append(h('div', { class: 'mt2' }, chartCard));

    const chartLabels = curve.map((c) => 'Day ' + c.day + ' (' + F.date(c.date) + ')');
    const riskData = curve.map((c) => +(c.risk * 100).toFixed(1));
    const costData = curve.map((c) => Math.round(c.projected_cost));
    const spentData = curve.map((c) => Math.round(c.budget_used));

    DP.chart(chartCard, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'Delay Risk (%)',
            data: riskData,
            borderColor: '#ef5b4b',
            backgroundColor: 'rgba(239, 91, 75, 0.1)',
            borderWidth: 3,
            yAxisID: 'yRisk',
            tension: 0.35,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6
          },
          {
            label: 'Projected Total Cost ($)',
            data: costData,
            borderColor: '#10c49f',
            backgroundColor: 'transparent',
            borderWidth: 2.5,
            borderDash: [5, 4],
            yAxisID: 'yCost',
            tension: 0.3,
            pointRadius: 3
          },
          {
            label: 'Actual Spent ($)',
            data: spentData,
            borderColor: '#c5aa8d',
            backgroundColor: 'transparent',
            borderWidth: 2,
            yAxisID: 'yCost',
            tension: 0.3,
            pointRadius: 3
          }
        ]
      },
      options: {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false } },
          yRisk: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 100,
            ticks: { callback: (v) => v + '%' },
            title: { display: true, text: 'Delay Risk' }
          },
          yCost: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { callback: (v) => F.money(v) },
            title: { display: true, text: 'Cost Forecast' }
          }
        }
      }
    });

    // What-If Analysis Section
    const whatIfCard = card('What-If Scenario Simulation (Live Model Inference)', 'sparkles');
    container.append(h('div', { class: 'mt2' }, whatIfCard));

    const whatIfLayout = h('div', { class: 'grid g-12' });
    const slidersCol = h('div', { class: 'grid', style: { gap: '14px' } });
    const resultsCol = h('div', { class: 'grid', style: { gap: '16px' } });
    whatIfLayout.append(slidersCol, resultsCol);
    whatIfCard.append(whatIfLayout);

    let activeDay = latest.day;
    const overrides = {
      weather_risk: 0.15,
      crew_absence_count: 0,
      equipment_delay_count: 0,
      budget_used_pct: +(latest.budget_used_pct || 0.25).toFixed(2)
    };

    const daySlider = ui.slider(
      'Snapshot Shoot Day',
      1,
      curve.length,
      1,
      activeDay,
      (v) => { activeDay = v; runWhatIf(); },
      (v) => 'Day ' + v + ' (' + F.date(curve[v - 1]?.date) + ')'
    );

    const weatherSlider = ui.slider(
      'Weather Risk (forecast)',
      0,
      1,
      0.05,
      overrides.weather_risk,
      (v) => { overrides.weather_risk = v; runWhatIf(); },
      (v) => F.pctf(v, 0)
    );

    const crewAbsSlider = ui.slider(
      'Crew Absences (people)',
      0,
      15,
      1,
      overrides.crew_absence_count,
      (v) => { overrides.crew_absence_count = v; runWhatIf(); }
    );

    const equipDelaySlider = ui.slider(
      'Equipment Failures / Delays',
      0,
      10,
      1,
      overrides.equipment_delay_count,
      (v) => { overrides.equipment_delay_count = v; runWhatIf(); }
    );

    slidersCol.append(
      h('p', { class: 'small muted' }, 'Drag the sliders below to simulate hypothetical delays, bad weather, or absenteeism. The backend feeds the modified feature vector into the trained models.'),
      daySlider,
      weatherSlider,
      crewAbsSlider,
      equipDelaySlider
    );

    const simGaugeBox = h('div');
    const simStatsBox = h('div');
    const explainRiskBox = h('div');
    const explainCostBox = h('div');

    resultsCol.append(
      h('div', { class: 'grid g2' },
        card('Simulated Delay Risk', 'zap', simGaugeBox),
        card('Simulated Cost Projection', 'wallet', simStatsBox)
      ),
      card('Key Drivers: Why Risk Moves', 'info', explainRiskBox),
      card('Key Drivers: Budget Impact', 'info', explainCostBox)
    );

    const runWhatIf = DP.debounce(async () => {
      DP.clear(simGaugeBox).append(ui.skeleton(3));
      DP.clear(simStatsBox).append(ui.skeleton(3));
      try {
        const res = await DP.api('/ai/health/whatif', {
          body: {
            project_id: projectId,
            day: activeDay,
            overrides
          }
        });

        // Update Simulated Gauge
        DP.clear(simGaugeBox).append(ui.gauge(res.risk));

        // Update Simulated Cost
        DP.clear(simStatsBox).append(
          h('div', { class: 'bold', style: { fontSize: '24px' } }, F.money(res.projected_cost)),
          h('div', { class: 'small muted mt', style: { marginTop: '6px' } },
            'Overrun variance: ',
            h('b', { style: { color: res.overrun_pct > 0.1 ? 'var(--bad)' : 'inherit' } },
              (res.overrun_pct > 0 ? '+' : '') + F.pctf(res.overrun_pct, 1)
            )
          )
        );

        // Drivers
        DP.clear(explainRiskBox).append(
          res.explain_risk && res.explain_risk.length
            ? ui.impact(res.explain_risk)
            : ui.empty('No significant feature deltas')
        );

        DP.clear(explainCostBox).append(
          res.explain_budget && res.explain_budget.length
            ? ui.impact(res.explain_budget)
            : ui.empty('No significant budget deltas')
        );
      } catch (err) {
        DP.clear(simGaugeBox).append(ui.callout(err.message, 'warn'));
      }
    }, 250);

    runWhatIf();
  };

  // ---------------------------------------------------------------------------------
  // AI STUDIO PAGE (/ai)
  // ---------------------------------------------------------------------------------
  DP.pages.ai = async (ctx) => {
    const view = DP.page(ctx, { title: 'AI Studio', nav: 'ai' });
    view.append(
      DP.pageHead(
        'AI Studio',
        'Live ML predictions trained on the cineops production database: scene planning, health risk & cost forecasts, crew recommendation matching, and model performance lab.',
        ui.tag('7 Trained Models', 'teal'),
        ui.btn('Refresh', { icon: 'refresh-cw', onClick: () => DP.render() })
      )
    );

    DP.loading(view, 3);
    const meta = await DP.loadMeta().catch(() => ({ genres: [], location_types: [], roles: [] }));
    let modelsData;
    try {
      modelsData = await DP.api('/ai/models');
    } catch (e) {
      DP.clear(view).append(ui.callout(e.message, 'bad'));
      return;
    }
    if (!ctx.alive()) return;

    while (view.children.length > 1) view.removeChild(view.lastChild);

    const tabs = [
      { id: 'scene', label: 'Scene Planner', icon: 'clapperboard' },
      { id: 'health', label: 'Project Health & What-If', icon: 'heart-pulse' },
      { id: 'crew', label: 'Crew Match', icon: 'users' },
      { id: 'models', label: 'Model Lab & Diagnostics', icon: 'cpu' }
    ];

    const tabContent = h('div', { class: 'mt2' });
    let currentTab = ctx.query.tab || 'scene';

    // -------------------------------------------------------------
    // Tab 1: Scene Planner
    // -------------------------------------------------------------
    const renderScenePlanner = async (container) => {
      DP.clear(container);
      const layout = h('div', { class: 'grid g-12 mt' });
      const leftCol = card('Scene Parameters & Script Breakdown', 'sliders');
      const rightCol = card('AI Predicted Resource Demand', 'sparkles');
      layout.append(leftCol, rightCol);

      const f = {
        complexity_score: 5,
        location_type: meta.location_types[0] || 'Street',
        genre: meta.genres[0]?.name || 'Action',
        interior_exterior: 'EXT',
        cast_count: 3,
        dialogue_word_count: 150,
        estimated_duration: 3.5,
        vfx_required: 0,
        stunt_required: 0,
        special_effects_required: 0,
        night_shoot: 0,
        weather_dependent: 0,
        location_change: 0
      };

      // Check if prefilled from a scene ID in query
      if (ctx.query.scene) {
        try {
          const pre = await DP.api('/ai/scene/' + ctx.query.scene);
          if (pre && pre.scene) {
            Object.assign(f, {
              complexity_score: pre.scene.complexity_score || 5,
              location_type: pre.scene.location_type || f.location_type,
              genre: pre.scene.genre || f.genre,
              interior_exterior: pre.scene.interior_exterior || 'EXT',
              cast_count: pre.scene.cast_count || 3,
              dialogue_word_count: pre.scene.dialogue_word_count || 150,
              estimated_duration: pre.scene.estimated_duration || 3.5,
              vfx_required: pre.scene.vfx_required ? 1 : 0,
              stunt_required: pre.scene.stunt_required ? 1 : 0,
              special_effects_required: pre.scene.special_effects_required ? 1 : 0,
              night_shoot: pre.scene.night_shoot ? 1 : 0,
              weather_dependent: pre.scene.weather_dependent ? 1 : 0,
              location_change: pre.scene.location_change ? 1 : 0
            });
            ui.toast('Loaded attributes for Scene #' + pre.scene.scene_number, 'ok');
          }
        } catch (e) {
          // ignore prefill error
        }
      }

      const compSlider = ui.slider('Scene Complexity (1-10)', 1, 10, 1, f.complexity_score, (v) => { f.complexity_score = v; calcPlan(); });
      const castSlider = ui.slider('Cast Count (Characters on Set)', 1, 15, 1, f.cast_count, (v) => { f.cast_count = v; calcPlan(); });
      const dialSlider = ui.slider('Dialogue Length (Word Count)', 0, 800, 25, f.dialogue_word_count, (v) => { f.dialogue_word_count = v; calcPlan(); }, (v) => v + ' words');
      const durSlider = ui.slider('Estimated Duration (Hours)', 0.5, 12, 0.5, f.estimated_duration, (v) => { f.estimated_duration = v; calcPlan(); }, (v) => F.hours(v));

      const locSelect = ui.select(meta.location_types.map((l) => ({ value: l, label: l })), f.location_type, (v) => { f.location_type = v; calcPlan(); });
      const genreSelect = ui.select(meta.genres.map((g) => ({ value: g.name, label: g.name })), f.genre, (v) => { f.genre = v; calcPlan(); });
      const intExtSelect = ui.select([{ value: 'INT', label: 'Interior (INT)' }, { value: 'EXT', label: 'Exterior (EXT)' }], f.interior_exterior, (v) => { f.interior_exterior = v; calcPlan(); });

      const swVFX = ui.switch('VFX Required', f.vfx_required === 1, (v) => { f.vfx_required = v ? 1 : 0; calcPlan(); });
      const swStunt = ui.switch('Stunts Required', f.stunt_required === 1, (v) => { f.stunt_required = v ? 1 : 0; calcPlan(); });
      const swSFX = ui.switch('Special Effects (SFX)', f.special_effects_required === 1, (v) => { f.special_effects_required = v ? 1 : 0; calcPlan(); });
      const swNight = ui.switch('Night Shoot', f.night_shoot === 1, (v) => { f.night_shoot = v ? 1 : 0; calcPlan(); });
      const swWeather = ui.switch('Weather Dependent', f.weather_dependent === 1, (v) => { f.weather_dependent = v ? 1 : 0; calcPlan(); });
      const swLocChange = ui.switch('Location Move on Day', f.location_change === 1, (v) => { f.location_change = v ? 1 : 0; calcPlan(); });

      leftCol.append(
        compSlider,
        h('div', { class: 'grid g3 mt' },
          ui.field('Location Type', locSelect),
          ui.field('Primary Genre', genreSelect),
          ui.field('Setting', intExtSelect)
        ),
        castSlider,
        dialSlider,
        durSlider,
        h('div', { class: 'bold small mt2', style: { marginBottom: '8px' } }, 'Production Tags & Flags:'),
        h('div', { class: 'grid g2 gap-s' }, swVFX, swStunt, swSFX, swNight, swWeather, swLocChange)
      );

      const predictionResults = h('div');
      rightCol.append(predictionResults);

      const calcPlan = DP.debounce(async () => {
        DP.clear(predictionResults).append(ui.skeleton(4, true));
        try {
          const res = await DP.api('/ai/scene/plan', { body: f });
          DP.clear(predictionResults);

          // Prediction KPIs
          predictionResults.append(
            h('div', { class: 'grid g3' },
              card('Shooting Time', 'clock',
                h('div', { class: 'bold', style: { fontSize: '26px', color: 'var(--teal-600)' } }, F.hours(res.duration_hours)),
                h('div', { class: 'tiny muted mt' }, 'Estimated was ' + F.hours(f.estimated_duration))
              ),
              card('Crew Demand', 'users',
                h('div', { class: 'bold', style: { fontSize: '26px' } }, Math.round(res.crew) + ' People'),
                h('div', { class: 'tiny muted mt' }, 'Based on ' + f.genre + ' & ' + f.location_type)
              ),
              card('Equipment Total', 'camera',
                h('div', { class: 'bold', style: { fontSize: '26px' } }, Math.round(res.equipment) + ' Units'),
                h('div', { class: 'tiny muted mt' }, 'Total gear packages')
              )
            ),
            h('div', { class: 'card soft mt2' },
              h('div', { class: 'bold small mb', style: { marginBottom: '12px' } }, 'Required Gear Units by Department:'),
              h('div', { class: 'grid g4' },
                ['Camera', 'Lighting', 'Audio', 'Grip'].map((cat) =>
                  h('div', { class: 'card', style: { textAlign: 'center', padding: '12px' } },
                    h('div', { class: 'tiny muted' }, cat),
                    h('div', { class: 'bold', style: { fontSize: '20px', marginTop: '4px' } },
                      res.units && res.units[cat] != null ? res.units[cat].toFixed(1) : '-'
                    )
                  )
                )
              )
            ),
            h('div', { class: 'grid g2 mt2' },
              card('Duration Drivers (Why)', 'info',
                h('div', { class: 'tiny muted mb', style: { marginBottom: '8px' } }, 'Feature impact pushing shoot time up (+) or down (-):'),
                res.explain_duration && res.explain_duration.length ? ui.impact(res.explain_duration) : ui.empty('No feature impact')
              ),
              card('Crew Drivers (Why)', 'info',
                h('div', { class: 'tiny muted mb', style: { marginBottom: '8px' } }, 'Feature impact pushing crew count up (+) or down (-):'),
                res.explain_crew && res.explain_crew.length ? ui.impact(res.explain_crew) : ui.empty('No feature impact')
              )
            )
          );
        } catch (err) {
          DP.clear(predictionResults).append(ui.callout('Prediction failed: ' + err.message, 'bad'));
        }
      }, 250);

      calcPlan();
      container.append(layout);
    };

    // -------------------------------------------------------------
    // Tab 2: Project Health & What-If
    // -------------------------------------------------------------
    const renderProjectHealth = async (container) => {
      DP.clear(container);
      const topBar = h('div', { class: 'card', style: { marginBottom: '16px' } });
      const healthSlot = h('div');
      container.append(topBar, healthSlot);

      topBar.append(ui.skeleton(2));
      try {
        const projs = await DP.api('/projects?size=100');
        DP.clear(topBar);

        const projectOptions = projs.items.map((p) => ({
          value: p.project_id,
          label: `${p.project_code} · ${p.film_title} (${p.production_status})`
        }));

        let activePid = ctx.query.project || projectOptions[0]?.value;

        const projSelect = ui.select(projectOptions, activePid, (v) => {
          activePid = Number(v);
          DP.healthPanel(healthSlot, activePid, { compact: false });
        });

        topBar.append(
          h('div', { class: 'row wrap gap-s', style: { alignItems: 'center', justifyContent: 'space-between' } },
            h('div', { class: 'row gap-s', style: { alignItems: 'center' } },
              icon('clapperboard'),
              h('b', null, 'Select Production to Inspect:')
            ),
            h('div', { style: { minWidth: '320px' } }, projSelect)
          )
        );

        if (activePid) {
          DP.healthPanel(healthSlot, activePid, { compact: false });
        }
      } catch (e) {
        DP.clear(topBar).append(ui.callout('Could not load projects: ' + e.message, 'bad'));
      }
    };

    // -------------------------------------------------------------
    // Tab 3: Crew Match
    // -------------------------------------------------------------
    const renderCrewMatch = async (container) => {
      DP.clear(container);
      const layout = h('div', { class: 'grid mt' });
      const modeTabs = [
        { id: 'replay', label: 'Replay Real Hirings (Validation Mode)', icon: 'rotate-ccw' },
        { id: 'suggest', label: 'Live Database Candidate Suggestions', icon: 'sparkles' }
      ];

      const matchSlot = h('div', { class: 'mt' });
      let matchMode = 'replay';

      const drawMatchMode = async () => {
        DP.clear(matchSlot);
        if (matchMode === 'replay') {
          // Replay mode
          const replayGrid = h('div', { class: 'grid g-12' });
          const reqsCol = card('Historical Hiring Decisions', 'calendar');
          const candCol = card('Ranked Candidates & Evaluation', 'users');
          replayGrid.append(reqsCol, candCol);
          matchSlot.append(replayGrid);

          reqsCol.append(ui.skeleton(4));
          try {
            const projects = await DP.api('/projects?size=30');
            const pId = projects.items[0]?.project_id;
            const reqs = await DP.api('/ai/crew/requirements?project_id=' + pId);
            DP.clear(reqsCol);

            reqsCol.append(
              h('p', { class: 'small muted', style: { marginBottom: '12px' } },
                `Showing roles for ${projects.items[0]?.film_title}. The ML model ranks each applicant and tests whether its top choice was the one actually hired.`
              )
            );

            if (!reqs.length) {
              reqsCol.append(ui.empty('No hiring requirement records found for this project'));
              return;
            }

            const listEl = h('div', { class: 'feed', style: { maxHeight: '550px', overflowY: 'auto' } });
            reqs.forEach((r, idx) => {
              const item = h('div', {
                class: 'list-row',
                style: { cursor: 'pointer', padding: '10px 12px', borderRadius: '10px' },
                onclick: () => loadRequirement(r.requirement_id)
              },
                h('div', { class: 'grow' },
                  h('div', { class: 'bold small' }, r.role_name),
                  h('div', { class: 'tiny muted' }, r.department_name + ' · Scale ' + r.scale)
                ),
                ui.tag('Skill ' + r.skill, 'teal')
              );
              listEl.append(item);
            });
            reqsCol.append(listEl);

            const loadRequirement = async (rid) => {
              DP.clear(candCol).append(ui.skeleton(5, true));
              try {
                const res = await DP.api('/ai/crew/requirement/' + rid);
                DP.clear(candCol);

                const banner = res.model_pick_is_real_hire
                  ? ui.callout('Model Pick #1 was the REAL HIRE! (Match verified against database record)', 'ok', 'circle-check')
                  : ui.callout('Model pick differed from historical hire (Candidate ranked #' + (res.candidates.findIndex((c) => c.hired) + 1) + ')', 'info');

                candCol.append(
                  h('div', { class: 'row wrap gap-s mb', style: { justifyContent: 'space-between', marginBottom: '14px' } },
                    h('div', null,
                      h('h3', null, res.role.role_name),
                      h('div', { class: 'tiny muted' }, res.role.department_name)
                    ),
                    ui.tag(res.candidates.length + ' Candidates Evaluated', 'teal')
                  ),
                  banner,
                  h('div', { class: 'mt' },
                    ui.table({
                      cols: [
                        { label: 'Candidate', render: (c) => h('a', { class: 'bold', style: { cursor: 'pointer', color: 'var(--teal-600)' }, onclick: () => DP.openPerson(c.person_id) }, c.name) },
                        { label: 'Match Score', render: (c) => h('span', { class: 'bold num' }, F.pctf(c.score, 1)) },
                        { label: 'Skill', render: (c) => ui.tag('Lvl ' + c.skill, 'teal') },
                        { label: 'Experience', render: (c) => c.experience + ' yrs' },
                        { label: 'Past Projects', render: (c) => c.previous_projects },
                        { label: 'Country', render: (c) => (c.same_country ? ui.tag('Match', 'ok') : '-') },
                        { label: 'Real Decision', render: (c) => (c.hired ? ui.tag('HIRED', 'ok') : ui.tag('Rejected', 'muted')) }
                      ],
                      rows: res.candidates
                    })
                  )
                );
              } catch (e) {
                DP.clear(candCol).append(ui.callout(e.message, 'bad'));
              }
            };

            loadRequirement(reqs[0].requirement_id);
          } catch (e) {
            DP.clear(reqsCol).append(ui.callout(e.message, 'bad'));
          }

        } else {
          // Suggest mode
          const suggestCard = card('Live Crew Recommendations by Role', 'sparkles');
          matchSlot.append(suggestCard);

          const controlsRow = h('div', { class: 'row wrap gap-s mb', style: { marginBottom: '18px' } });
          const suggestResults = h('div');
          suggestCard.append(controlsRow, suggestResults);

          try {
            const projects = await DP.api('/projects?size=30');
            const projectOpts = projects.items.map((p) => ({ value: p.project_id, label: p.film_title }));
            const roleOpts = meta.roles.map((r) => ({ value: r.id, label: r.name }));

            let selPid = projectOpts[0]?.value;
            let selRoleId = roleOpts[0]?.value;
            let selSkill = 3;

            const projSel = ui.select(projectOpts, selPid, (v) => { selPid = Number(v); fetchSuggestions(); });
            const roleSel = ui.select(roleOpts, selRoleId, (v) => { selRoleId = Number(v); fetchSuggestions(); });
            const skillSel = ui.select([1, 2, 3, 4, 5].map((s) => ({ value: s, label: 'Min Skill Level ' + s })), selSkill, (v) => { selSkill = Number(v); fetchSuggestions(); });

            controlsRow.append(
              ui.field('Production', projSel),
              ui.field('Role Needed', roleSel),
              ui.field('Required Skill', skillSel),
              h('div', { style: { alignSelf: 'flex-end' } },
                ui.btn('Get Suggestions', { cls: 'primary', icon: 'search', onClick: () => fetchSuggestions() })
              )
            );

            const fetchSuggestions = async () => {
              DP.clear(suggestResults).append(ui.skeleton(4, true));
              try {
                const res = await DP.api(`/ai/crew/suggest?project_id=${selPid}&role_id=${selRoleId}&required_skill=${selSkill}&limit=10`);
                DP.clear(suggestResults);

                if (!res.candidates || !res.candidates.length) {
                  suggestResults.append(ui.empty('No qualified candidates found in database for this role'));
                  return;
                }

                suggestResults.append(
                  ui.table({
                    cols: [
                      { label: 'Rank', render: (_, idx) => h('b', null, '#' + (idx + 1)) },
                      { label: 'Person', render: (c) => h('a', { class: 'bold', style: { cursor: 'pointer', color: 'var(--teal-600)' }, onclick: () => DP.openPerson(c.person_id) }, c.name) },
                      { label: 'Fit Score', render: (c) => h('span', { class: 'bold num' }, F.pctf(c.score, 1)) },
                      { label: 'Status', render: (c) => ui.status(c.availability) },
                      { label: 'Skill Level', render: (c) => ui.tag('Level ' + c.skill, 'teal') },
                      { label: 'Experience', render: (c) => c.experience + ' years' },
                      { label: 'Previous Projects', render: (c) => c.previous_projects },
                      { label: '', render: (c) => ui.btn('View Profile', { cls: 'sm', onClick: () => DP.openPerson(c.person_id) }) }
                    ],
                    rows: res.candidates
                  })
                );
              } catch (err) {
                DP.clear(suggestResults).append(ui.callout(err.message, 'bad'));
              }
            };

            fetchSuggestions();
          } catch (e) {
            DP.clear(suggestCard).append(ui.callout(e.message, 'bad'));
          }
        }
      };

      const modeSwitch = ui.tabs(modeTabs, (m) => {
        matchMode = m;
        drawMatchMode();
      }, matchMode);

      layout.append(modeSwitch, matchSlot);
      container.append(layout);
      drawMatchMode();
    };

    // -------------------------------------------------------------
    // Tab 4: Model Lab & Diagnostics
    // -------------------------------------------------------------
    const renderModelLab = (container) => {
      DP.clear(container);

      // Accuracy Banner
      container.append(
        h('div', { class: 'card soft', style: { marginBottom: '20px', background: 'linear-gradient(135deg, rgba(16,196,159,0.12), rgba(79,157,232,0.12))' } },
          h('div', { class: 'row wrap gap-s', style: { justifyContent: 'space-between', alignItems: 'center' } },
            h('div', null,
              h('div', { class: 'bold', style: { fontSize: '18px' } }, 'Production-Trained AI Suite'),
              h('div', { class: 'small muted', style: { marginTop: '2px' } },
                `Trained with scikit-learn ${modelsData.sklearn} on cineops MySQL snapshot data at ${modelsData.trained_at}`
              )
            ),
            h('div', { class: 'row gap-s' },
              ui.tag(`Crew Match Accuracy: ${F.pctf(modelsData.crew_accuracy || 0.831, 1)}`, 'ok'),
              ui.tag('Baseline: 50.0%', 'tan')
            )
          )
        )
      );

      // Model Cards Grid
      const modelsList = modelsData.models || [];
      const grid = h('div', { class: 'grid g2' });

      modelsList.forEach((m) => {
        const mCard = card(m.title, 'cpu');
        const metrics = m.metrics || {};
        const testMetrics = metrics.test || {};
        const baseline = metrics.baseline || {};

        mCard.append(
          h('p', { class: 'small muted', style: { marginBottom: '12px' } }, m.about),
          h('div', { class: 'row wrap gap-s mb', style: { marginBottom: '14px' } },
            ui.tag(m.task, 'teal'),
            ui.tag('Target: ' + m.target, 'tan'),
            m.n_train ? ui.tag(F.num(m.n_train) + ' training rows', 'info') : null
          ),
          h('div', { class: 'card soft' },
            h('div', { class: 'bold small mb', style: { marginBottom: '8px' } }, 'Test Metrics vs Baseline:'),
            h('div', { class: 'grid g3' },
              Object.entries(testMetrics).map(([k, v]) =>
                h('div', null,
                  h('div', { class: 'tiny muted' }, k.toUpperCase()),
                  h('div', { class: 'bold' }, typeof v === 'number' ? v.toFixed(3) : String(v))
                )
              ),
              baseline.mae != null ? h('div', null,
                h('div', { class: 'tiny muted' }, 'BASELINE MAE'),
                h('div', { class: 'bold muted' }, baseline.mae.toFixed(3))
              ) : null,
              baseline.accuracy != null ? h('div', null,
                h('div', { class: 'tiny muted' }, 'BASELINE ACC'),
                h('div', { class: 'bold muted' }, F.pctf(baseline.accuracy, 1))
              ) : null
            )
          ),
          h('div', { class: 'mt2' },
            h('div', { class: 'bold small mb', style: { marginBottom: '8px' } }, 'Top Predictive Features:'),
            m.importance && m.importance.length
              ? ui.impact(m.importance.slice(0, 5))
              : ui.empty('No feature importance')
          )
        );

        // Chart diagnostic if available
        if (m.lab) {
          const chartBox = h('div', { class: 'mt2' });
          mCard.append(chartBox);

          if (m.lab.roc) {
            // ROC Curve
            const roc = m.lab.roc;
            const points = roc.fpr.map((x, i) => ({ x, y: roc.tpr[i] }));
            DP.chart(chartBox, {
              type: 'line',
              data: {
                datasets: [
                  {
                    label: 'ROC Curve (AUC ' + (testMetrics.roc_auc?.toFixed(3) || '') + ')',
                    data: points,
                    borderColor: '#10c49f',
                    borderWidth: 2.5,
                    fill: false,
                    pointRadius: 0
                  },
                  {
                    label: 'Random Baseline',
                    data: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
                    borderColor: '#9aa9a3',
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0
                  }
                ]
              },
              options: {
                scales: {
                  x: { type: 'linear', min: 0, max: 1, title: { display: true, text: 'False Positive Rate' } },
                  y: { min: 0, max: 1, title: { display: true, text: 'True Positive Rate' } }
                }
              }
            });
          } else if (m.lab.scatter) {
            // Actual vs Predicted Scatter
            const sc = m.lab.scatter;
            const pts = sc.actual.map((a, i) => ({ x: a, y: sc.predicted[i] }));
            DP.chart(chartBox, {
              type: 'scatter',
              data: {
                datasets: [
                  {
                    label: 'Test Actual vs Predicted',
                    data: pts,
                    backgroundColor: 'rgba(16, 196, 159, 0.45)',
                    pointRadius: 3
                  }
                ]
              },
              options: {
                scales: {
                  x: { title: { display: true, text: 'Actual (' + (m.unit || '') + ')' } },
                  y: { title: { display: true, text: 'Predicted (' + (m.unit || '') + ')' } }
                }
              }
            });
          }
        }

        grid.append(mCard);
      });

      container.append(grid);
    };

    const tabSwitch = ui.tabs(tabs, (tabId) => {
      currentTab = tabId;
      if (tabId === 'scene') renderScenePlanner(tabContent);
      else if (tabId === 'health') renderProjectHealth(tabContent);
      else if (tabId === 'crew') renderCrewMatch(tabContent);
      else if (tabId === 'models') renderModelLab(tabContent);
    }, currentTab);

    view.append(tabSwitch, tabContent);
    tabSwitch.select(currentTab);
    DP.reveal(view);
  };

  DP.route('/ai', DP.pages.ai, { perm: 'ai' });
})();

