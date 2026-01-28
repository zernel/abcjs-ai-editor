import { useState, useEffect, useRef } from "react";
import abcjs from "abcjs";
import "abcjs/abcjs-audio.css";
import type { Route } from "./+types/_index";

// -----------------------------------------------------------------------------
// 1. 类型定义与初始数据
// -----------------------------------------------------------------------------

// 一段默认的简单乐谱 (C大调音阶)
const DEFAULT_ABC = `X:1
T:Demo Scale
M:4/4
L:1/4
K:C
C D E F | G A B c | c B A G | F E D C |]`;

// AI 系统提示词：这是让 AI 乖乖写谱的关键
const SYSTEM_PROMPT = `You are an expert music composer and ABC notation specialist.
Your task is to modify the provided ABC music notation based on the user's request.
RULES:
1. Return ONLY the valid ABC notation code.
2. Do NOT include markdown formatting (like \`\`\`abc).
3. Do NOT include explanations.
4. Maintain valid ABC syntax headers (X, T, M, L, K) if needed.
`;

export function meta({}: Route.MetaArgs) {
  return [
    { title: "AI Music Editor (MVP)" },
    { name: "description", content: "Compose music with ABC notation and AI" },
  ];
}

export default function Index() {
  // ---------------------------------------------------------------------------
  // 2. 状态管理
  // ---------------------------------------------------------------------------
  const [abcString, setAbcString] = useState(DEFAULT_ABC);
  const [apiKey, setApiKey] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 播放器相关状态
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  
  // 引用 DOM 元素用于渲染乐谱
  const notationRef = useRef<HTMLDivElement>(null);
  const synthControlRef = useRef<any>(null);
  const visualObjRef = useRef<any>(null);

  // ---------------------------------------------------------------------------
  // 3. 副作用 (Effects)
  // ---------------------------------------------------------------------------

  // 初始化：从 LocalStorage 读取数据
  useEffect(() => {
    const savedKey = localStorage.getItem("openai_api_key");
    const savedAbc = localStorage.getItem("draft_abc");
    if (savedKey) setApiKey(savedKey);
    if (savedAbc) setAbcString(savedAbc);
  }, []);

  // 持久化：当 API Key 或 ABC 改变时保存
  useEffect(() => {
    localStorage.setItem("draft_abc", abcString);
    if (apiKey) localStorage.setItem("openai_api_key", apiKey);
  }, [abcString, apiKey]);

  // 渲染：当 abcString 改变时，调用 abcjs 渲染
  useEffect(() => {
    if (notationRef.current) {
      const visualObj = abcjs.renderAbc(notationRef.current, abcString, {
        responsive: "resize", // 自适应宽度
        add_classes: true,
      });
      
      // 保存可视化对象用于播放
      if (visualObj && visualObj.length > 0) {
        visualObjRef.current = visualObj[0];
        setIsPlayerReady(true);
      }
    }
  }, [abcString]);

  // ---------------------------------------------------------------------------
  // 4. 播放器控制逻辑
  // ---------------------------------------------------------------------------

  const initPlayer = async () => {
    if (!visualObjRef.current) return;

    try {
      // 创建新的合成器控制器
      const synthControl = new abcjs.synth.SynthController();
      synthControl.load("#audio-player", null, {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
        displayWarp: true,
      });

      await synthControl.setTune(visualObjRef.current, false, {
        program: 0, // 0 = Acoustic Grand Piano
        midiTranspose: 0,
      });

      synthControlRef.current = synthControl;
      setIsPlayerReady(true);
    } catch (err: any) {
      console.error("Failed to initialize player:", err);
      setError("播放器初始化失败：" + err.message);
    }
  };

  const handlePlay = async () => {
    if (!visualObjRef.current) {
      setError("请先加载乐谱");
      return;
    }

    try {
      if (!synthControlRef.current) {
        await initPlayer();
      }

      if (synthControlRef.current) {
        await synthControlRef.current.play();
        setIsPlaying(true);
      }
    } catch (err: any) {
      console.error("Playback error:", err);
      setError("播放失败：" + err.message);
    }
  };

  const handlePause = () => {
    if (synthControlRef.current) {
      synthControlRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleStop = () => {
    if (synthControlRef.current) {
      synthControlRef.current.pause();
      synthControlRef.current.seek(0);
      setIsPlaying(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 5. 交互逻辑 (AI 调用)
  // ---------------------------------------------------------------------------

  const handleAiEdit = async () => {
    if (!apiKey) {
      alert("请先在设置中输入 OpenAI API Key");
      return;
    }
    if (!prompt.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o", // 或者 gpt-3.5-turbo
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { 
              role: "user", 
              content: `Current ABC notation:\n${abcString}\n\nUser Request: ${prompt}` 
            },
          ],
          temperature: 0.7,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "API request failed");
      }

      let newAbc = data.choices[0].message.content;

      // 清理可能存在的 Markdown 标记 (以防万一)
      newAbc = newAbc.replace(/```abc/g, "").replace(/```/g, "").trim();

      setAbcString(newAbc);
      setPrompt(""); // 清空输入框
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 6. 界面渲染
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans">
      {/* 顶部导航 */}
      <header className="flex justify-between items-center p-4 bg-white border-b border-gray-200 shadow-sm z-10">
        <h1 className="text-xl font-bold text-indigo-600">🎹 AI Music Editor</h1>
        <div className="flex gap-2">
          <input
            type="password"
            placeholder="OpenAI API Key (sk-...)"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="border rounded px-3 py-1 text-sm w-48 focus:w-64 transition-all"
          />
        </div>
      </header>

      {/* 主工作区 */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* Loading 遮罩层 */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
            <p className="mt-4 text-indigo-600 font-medium">AI 正在谱曲中...</p>
          </div>
        )}

        {/* 左侧：编辑器 & 对话 */}
        <div className="w-full md:w-1/3 flex flex-col border-r border-gray-200 bg-white">
          
          {/* 代码编辑器 */}
          <div className="flex-1 p-4 flex flex-col">
            <label className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              ABC Source Code
            </label>
            <textarea
              value={abcString}
              onChange={(e) => setAbcString(e.target.value)}
              className="flex-1 w-full p-3 font-mono text-sm bg-gray-50 border border-gray-300 rounded resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              spellCheck={false}
              disabled={isLoading}
            />
          </div>

          {/* AI 对话框 */}
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            {error && (
              <div className="mb-2 text-xs text-red-600 bg-red-100 p-2 rounded">
                Error: {error}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Ask AI to change it
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="例如：改为 G 大调，或者把节奏改快一点..."
                className="w-full p-3 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none h-20 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAiEdit();
                  }
                }}
              />
              <button
                onClick={handleAiEdit}
                disabled={isLoading || !prompt.trim()}
                className="self-end px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Send to AI
              </button>
            </div>
          </div>
        </div>

        {/* 右侧：乐谱预览 */}
        <div className={`flex-1 p-8 overflow-auto bg-white transition-opacity duration-300 ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
           <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-xl p-8 min-h-[500px]">
              {/* 播放控制按钮 */}
              <div className="mb-6 flex gap-3 items-center justify-center">
                <button
                  onClick={handlePlay}
                  disabled={!isPlayerReady || isPlaying}
                  className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                  </svg>
                  Play
                </button>
                <button
                  onClick={handlePause}
                  disabled={!isPlaying}
                  className="flex items-center gap-2 px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75A.75.75 0 007.25 3h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
                  </svg>
                  Pause
                </button>
                <button
                  onClick={handleStop}
                  disabled={!isPlayerReady}
                  className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-8.5z" />
                  </svg>
                  Stop
                </button>
              </div>

              {/* abcjs 内置播放器 UI (可选) */}
              <div id="audio-player" className="mb-6"></div>
              
              {/* 乐谱显示 */}
              <div ref={notationRef} id="paper" className="w-full"></div>
              
              {/* 如果乐谱为空的提示 */}
              {!abcString && (
                <div className="text-center text-gray-400 mt-20">
                  No music notation to display. Start typing or ask AI!
                </div>
              )}
           </div>
        </div>

      </main>
    </div>
  );
}