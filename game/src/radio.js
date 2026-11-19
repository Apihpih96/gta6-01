export function createRadioSystem(audio) {
  // Three stations, each with its own musical character
  // All music generated via WebAudio oscillators through audio.getContext()

  const STATIONS = [
    {
      name: 'SynthWave FM',
      bpm: 110,
      // E minor pentatonic, driving arpeggio
      notes: [164.81, 196.0, 220.0, 246.94, 293.66, 329.63],
      type: 'synthwave',
    },
    {
      name: 'Lo-Fi Chill',
      bpm: 75,
      // C major 7th chord tones, mellow
      notes: [261.63, 329.63, 392.0, 493.88],
      type: 'lofi',
    },
    {
      name: 'Night Drive',
      bpm: 90,
      // D dorian, sparse ambient pads
      notes: [293.66, 329.63, 349.23, 392.0, 440.0],
      type: 'ambient',
    },
  ];

  let currentStation = 0;
  let playing = false;
  let ctx = null;
  let masterGain = null;
  let oscillators = [];
  let nextBeatTime = 0;
  let beatIndex = 0;
  let scheduledAhead = 0.1; // seconds to look ahead
  let scheduleInterval = 0.05;

  function getCtx() {
    if (!ctx) {
      // AudioContext only exists after the audio engine is initialised
      // (a user gesture); before that there is nothing to play through.
      ctx = audio.getContext();
      if (!ctx) return null;
      masterGain = ctx.createGain();
      masterGain.gain.value = 0;
      masterGain.connect(ctx.destination);
    }
    return ctx;
  }

  function clearOscillators() {
    oscillators.forEach(({ osc, gain }) => {
      try {
        osc.stop();
      } catch (e) {
        // already stopped
      }
      gain.disconnect();
      osc.disconnect();
    });
    oscillators = [];
  }

  function scheduleBeat(station, time, beat) {
    const c = getCtx();
    const bpm = station.bpm;
    const beatDur = 60 / bpm;

    if (station.type === 'synthwave') {
      // Bass on every beat, arp on off-beats
      const bassIdx = beat % station.notes.length;
      const bassFreq = station.notes[bassIdx] / 2;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = bassFreq;
      gain.gain.setValueAtTime(0.18, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + beatDur * 0.8);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(time);
      osc.stop(time + beatDur);
      oscillators.push({ osc, gain });

      // Hi-hat-like noise on even beats
      if (beat % 2 === 0) {
        const hat = c.createOscillator();
        const hatGain = c.createGain();
        hat.type = 'square';
        hat.frequency.value = 800 + Math.random() * 400;
        hatGain.gain.setValueAtTime(0.04, time);
        hatGain.gain.exponentialRampToValueAtTime(0.001, time + beatDur * 0.15);
        hat.connect(hatGain);
        hatGain.connect(masterGain);
        hat.start(time);
        hat.stop(time + beatDur * 0.2);
        oscillators.push({ osc: hat, gain: hatGain });
      }
    } else if (station.type === 'lofi') {
      // Soft chords, Rhodes-like
      const root = station.notes[beat % station.notes.length];
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = root;
      gain.gain.setValueAtTime(0.1, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + beatDur * 1.5);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(time);
      osc.stop(time + beatDur * 1.6);
      oscillators.push({ osc, gain });

      // Subtle kick
      if (beat % 4 === 0) {
        const kick = c.createOscillator();
        const kGain = c.createGain();
        kick.type = 'sine';
        kick.frequency.setValueAtTime(150, time);
        kick.frequency.exponentialRampToValueAtTime(40, time + 0.12);
        kGain.gain.setValueAtTime(0.15, time);
        kGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
        kick.connect(kGain);
        kGain.connect(masterGain);
        kick.start(time);
        kick.stop(time + 0.2);
        oscillators.push({ osc: kick, gain: kGain });
      }
    } else if (station.type === 'ambient') {
      // Sparse pads, long release
      if (beat % 4 === 0) {
        const idx = Math.floor(beat / 4) % station.notes.length;
        const freq = station.notes[idx];
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0, time);
        gain.gain.linearRampToValueAtTime(0.08, time + beatDur * 2);
        gain.gain.exponentialRampToValueAtTime(0.001, time + beatDur * 6);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(time);
        osc.stop(time + beatDur * 7);
        oscillators.push({ osc, gain });
      }
      // Sub bass drone
      if (beat % 16 === 0) {
        const drone = c.createOscillator();
        const dGain = c.createGain();
        drone.type = 'sine';
        drone.frequency.value = 55;
        dGain.gain.setValueAtTime(0.06, time);
        dGain.gain.exponentialRampToValueAtTime(0.001, time + beatDur * 14);
        drone.connect(dGain);
        dGain.connect(masterGain);
        drone.start(time);
        drone.stop(time + beatDur * 15);
        oscillators.push({ osc: drone, gain: dGain });
      }
    }
  }

  function scheduler() {
    if (!playing) return;
    const c = getCtx();
    if (!c) return;
    const station = STATIONS[currentStation];
    const beatDur = 60 / station.bpm;

    while (nextBeatTime < c.currentTime + scheduledAhead) {
      scheduleBeat(station, nextBeatTime, beatIndex);
      beatIndex++;
      nextBeatTime += beatDur;
    }
  }

  function startPlaying() {
    if (playing) return;
    const c = getCtx();
    if (!c) return;
    playing = true;
    nextBeatTime = c.currentTime + 0.05;
    beatIndex = 0;
    masterGain.gain.setValueAtTime(0.25, c.currentTime);
  }

  function stopPlaying() {
    if (!playing) return;
    playing = false;
    const c = getCtx();
    if (c && masterGain) {
      masterGain.gain.setValueAtTime(0, c.currentTime);
    }
    // Clean up oscillators after a beat so they finish naturally
    setTimeout(() => {
      clearOscillators();
    }, 2000);
  }

  function switchStation(hud) {
    currentStation = (currentStation + 1) % STATIONS.length;
    const name = STATIONS[currentStation].name;
    if (hud) {
      hud.showMessage(`Radio: ${name}`);
    }
    // Restart the scheduler for the new station
    stopPlaying();
    clearOscillators();
    if (playing) {
      startPlaying();
    }
  }

  function update(dt, actions, travelMode, hud) {
    // Only play while driving and not muted
    if (travelMode === 'driving' && !audio.isMuted()) {
      if (!playing) {
        startPlaying();
      }
      scheduler();

      // Check for radio button press
      if (actions && actions.radio) {
        switchStation(hud);
      }
    } else {
      if (playing) {
        stopPlaying();
      }
    }
  }

  function stop() {
    stopPlaying();
    clearOscillators();
  }

  return {
    update,
    stop,
    switchStation,
  };
}
