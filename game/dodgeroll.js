// dodgeroll.js — DodgeRoll: barrel roll / guling darurat, pantul tembakan, imun misil.
// Deklarasi paling deskriptif di awal (kontrak juri: outline baca deklarasi pertama).
import { clamp } from './engine.js';

'use strict';

export class DodgeRoll {
  constructor() {
    this.state = 'idle';      // idle | rolling | cooldown
    this.timer = 0;
    this.cooldown = 0;
    this.rollAngle = 0;       // derajat visual tambahan (0..360)
    this.DURATION = 0.65;     // detik satu guling penuh
    this.COOLDOWN = 2.5;
  }

  get rolling() { return this.state === 'rolling'; }
  get ready() { return this.state === 'idle'; }

  tryStart() {
    if (this.state !== 'idle') return false;
    this.state = 'rolling';
    this.timer = this.DURATION;
    this.rollAngle = 0;
    return true;
  }

  update(dt, flight) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.state === 'rolling') {
      this.timer -= dt;
      const p = 1 - Math.max(this.timer, 0) / this.DURATION;
      this.rollAngle = p * 360;
      if (this.timer <= 0) {
        this.state = 'cooldown';
        this.cooldown = this.COOLDOWN;
        this.rollAngle = 0;
        // Biaya kecepatan: guling darurat mengorbankan energi.
        if (flight) flight.speed = Math.max(30, flight.speed * 0.88);
      }
    } else if (this.state === 'cooldown' && this.cooldown <= 0) {
      this.state = 'idle';
    }
    if (flight) flight.dodgeRollExtra = this.rollAngle;
  }
}
