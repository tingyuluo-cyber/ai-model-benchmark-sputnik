"use client";

import { useCallback, useRef, useState } from "react";
import { SputnikScene, type SputnikSceneHandle } from "./sputnik-scene";

const facts = [
  ["发射", "1957.10.04"],
  ["质量", "83.6 kg"],
  ["球体直径", "58 cm"],
  ["轨道周期", "96.17 min"],
];

export default function Home() {
  const sceneRef = useRef<SputnikSceneHandle>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  const playSignal = useCallback(() => {
    if (isPlaying) return;
    const AudioContextClass = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const context = audioRef.current ?? new AudioContextClass();
    audioRef.current = context;
    const start = context.currentTime + 0.04;
    setIsPlaying(true);

    for (let index = 0; index < 8; index += 1) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const time = start + index * 0.6;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(index % 2 === 0 ? 740 : 660, time);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.055, time + 0.012);
      gain.gain.setValueAtTime(0.055, time + 0.25);
      gain.gain.linearRampToValueAtTime(0, time + 0.29);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.3);
    }

    window.setTimeout(() => setIsPlaying(false), 4900);
  }, [isPlaying]);

  return (
    <main>
      <section className="hero" aria-labelledby="main-title">
        <header className="topbar">
          <a className="wordmark" href="#main-title" aria-label="返回首页">
            <span className="wordmark-dot" />
            PS—1 / ARCHIVE
          </a>
          <nav aria-label="页面导航">
            <a href="#story">档案</a>
            <a href="#signal">信号</a>
            <a href="#legacy">遗产</a>
          </nav>
        </header>

        <div className="hero-copy">
          <p className="eyebrow">OBJECT 01 · EARTH ORBIT</p>
          <h1 id="main-title">
            斯普特尼克
            <span>一号</span>
          </h1>
          <p className="intro">
            第一颗进入地球轨道的人造卫星。
            <br />
            一枚直径仅 58 厘米的银色球体，开启了太空时代。
          </p>
        </div>

        <div className="model-stage">
          <div className="orbit orbit-a" aria-hidden="true" />
          <div className="orbit orbit-b" aria-hidden="true" />
          <SputnikScene ref={sceneRef} autoRotate={autoRotate} />
          <div className="model-caption caption-left" aria-hidden="true">
            <span>01</span>
            铝合金承压球体
          </div>
          <div className="model-caption caption-right" aria-hidden="true">
            <span>04</span>
            鞭状天线
          </div>
        </div>

        <div className="controls" aria-label="三维模型控制">
          <button
            type="button"
            className="control-button"
            onClick={() => sceneRef.current?.reset()}
          >
            <span className="reset-icon" aria-hidden="true">↺</span>
            复位视角
          </button>
          <button
            type="button"
            className={`control-button ${autoRotate ? "is-active" : ""}`}
            aria-pressed={autoRotate}
            onClick={() => setAutoRotate((value) => !value)}
          >
            <span className="status-dot" aria-hidden="true" />
            自动巡航
          </button>
        </div>

        <p className="drag-hint"><span aria-hidden="true">↔</span> 拖动旋转 · 滚轮缩放</p>

        <div className="hero-index" aria-hidden="true">
          <span>65.6° N</span>
          <span>0001 / 1957</span>
        </div>
      </section>

      <section className="facts" aria-label="关键数据">
        {facts.map(([label, value], index) => (
          <article key={label}>
            <span>0{index + 1}</span>
            <p>{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className="story section-shell" id="story">
        <div className="section-number" aria-hidden="true">01</div>
        <div className="section-heading">
          <p className="eyebrow">THE OBJECT</p>
          <h2>简单，<br />却足以改变世界。</h2>
        </div>
        <div className="story-copy">
          <p className="lead">
            1957 年 10 月 4 日，苏联从拜科努尔发射场将 PS-1 送入轨道。
            它没有相机，也没有复杂的科学仪器——只有电池、温度与压力传感器，以及两台无线电发射机。
          </p>
          <div className="detail-grid">
            <p><span>结构</span>两个铝合金半球密封连接，内部充入氮气，维持约 1.3 个大气压。</p>
            <p><span>天线</span>四根弹簧展开式鞭状天线，其中两根长 2.4 米，另两根长 2.9 米。</p>
          </div>
        </div>
      </section>

      <section className="signal section-shell" id="signal">
        <div className="signal-visual" aria-hidden="true">
          {Array.from({ length: 22 }).map((_, index) => (
            <i key={index} style={{ "--bar": `${18 + ((index * 17) % 72)}%` } as React.CSSProperties} />
          ))}
        </div>
        <div className="signal-content">
          <p className="eyebrow">THE SIGNAL · 20.005 MHz</p>
          <h2>嘀—嘀—嘀</h2>
          <p>
            两台发射机在 20.005 与 40.002 MHz 上交替播发脉冲。世界各地的无线电爱好者都能听见：
            人造物体正在头顶运行。
          </p>
          <button type="button" className="listen-button" onClick={playSignal} disabled={isPlaying}>
            <span className="play-triangle" aria-hidden="true" />
            {isPlaying ? "正在播放模拟信号" : "试听模拟信号"}
          </button>
        </div>
      </section>

      <section className="legacy section-shell" id="legacy">
        <div className="legacy-date" aria-hidden="true">1957</div>
        <div className="legacy-copy">
          <p className="eyebrow">THE LEGACY</p>
          <h2>一颗新的“月亮”</h2>
          <p>
            斯普特尼克一号在轨运行约三个月，于 1958 年 1 月重返大气层。
            它短暂的旅程证明了人类可以把物体送入环绕地球的轨道，也由此拉开了太空时代的序幕。
          </p>
        </div>
        <div className="legacy-mark" aria-hidden="true">
          <span>СПУТНИК</span>
          <i />
          <span>01</span>
        </div>
      </section>

      <footer>
        <p>PS—1 DIGITAL ARCHIVE</p>
        <p>FIRST ARTIFICIAL SATELLITE · 04 OCT 1957</p>
      </footer>
    </main>
  );
}
