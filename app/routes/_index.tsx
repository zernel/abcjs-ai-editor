import { useState, useEffect, useRef, useCallback } from "react";
import abcjs from "abcjs";
import "abcjs/abcjs-audio.css";
import type { Route } from "./+types/_index";
import { AbcEditor } from "../components/AbcEditor";

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

// 预设示例模板
const EXAMPLE_TEMPLATES = [
  {
    name: "C大调音阶",
    abc: `X:1
T:C Major Scale
M:4/4
L:1/4
K:C
C D E F | G A B c | c B A G | F E D C |]`,
  },
  {
    name: "小星星",
    abc: `X:1
T:Twinkle Twinkle Little Star
M:4/4
L:1/4
K:C
C C G G | A A G2 | F F E E | D D C2 |
G G F F | E E D2 | G G F F | E E D2 |
C C G G | A A G2 | F F E E | D D C2 |]`,
  },
  {
    name: "生日快乐",
    abc: `X:1
T:Happy Birthday
M:3/4
L:1/8
K:C
G2 G2 A2 | G2 c2 B4 | G2 G2 A2 | G2 d2 c4 |
G2 G2 g2 | e2 c2 B2 A2 | f2 f2 e2 | c2 d2 c4 |]`,
  },
  {
    name: "简单练习曲",
    abc: `X:1
T:Simple Exercise
M:4/4
L:1/8
K:C
C2 E2 G2 c2 | c2 G2 E2 C2 | D2 F2 A2 d2 | d2 A2 F2 D2 |
E2 G2 B2 e2 | e2 B2 G2 E2 | F2 A2 c2 f2 | f2 c2 A2 F2 |]`,
  },
];

// AI 系统提示词：这是让 AI 乖乖写谱的关键
const SYSTEM_PROMPT = `You are an expert music composer and ABC notation specialist.
Your task is to modify the provided ABC music notation based on the user's request.
RULES:
1. Return ONLY the valid ABC notation code.
2. Do NOT include markdown formatting (like \`\`\`abc).
3. Do NOT include explanations.
4. Maintain valid ABC syntax headers (X, T, M, L, K) if needed.
`;

// AI 提示词建议
const AI_SUGGESTIONS = [
  "改为 G 大调",
  "加快节奏，改为 1/8 音符",
  "添加和弦符号",
  "把旋律倒过来",
  "改为 3/4 拍",
  "添加装饰音",
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "AI Music Editor" },
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
  const [isPlayerUpdating, setIsPlayerUpdating] = useState(false);
  
  // UI 状态
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [mobileTab, setMobileTab] = useState<'editor' | 'notation'>('editor');
  
  // 历史记录 (撤销/重做)
  const [history, setHistory] = useState<string[]>([DEFAULT_ABC]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  // 引用 DOM 元素用于渲染乐谱
  const notationRef = useRef<HTMLDivElement>(null);
  const notationMobileRef = useRef<HTMLDivElement>(null);
  const synthControlRef = useRef<any>(null);
  const visualObjRef = useRef<any>(null);
  const timingCallbacksRef = useRef<any>(null);
  
  // 交互状态：代码选中范围
  const [selectedRange, setSelectedRange] = useState<{ from: number; to: number } | null>(null);

  // ---------------------------------------------------------------------------
  // 3. 副作用 (Effects)
  // ---------------------------------------------------------------------------

  // 初始化：从 LocalStorage 读取数据
  useEffect(() => {
    const savedKey = localStorage.getItem("openai_api_key");
    const savedAbc = localStorage.getItem("draft_abc");
    const hasVisited = localStorage.getItem("has_visited");
    
    if (savedKey) setApiKey(savedKey);
    if (savedAbc) {
      setAbcString(savedAbc);
      setHistory([savedAbc]);
    }
    
    // 首次访问显示欢迎页
    if (!hasVisited) {
      setShowWelcome(true);
      localStorage.setItem("has_visited", "true");
    }
  }, []);

  // 持久化：当 API Key 或 ABC 改变时保存
  useEffect(() => {
    localStorage.setItem("draft_abc", abcString);
    if (apiKey) localStorage.setItem("openai_api_key", apiKey);
  }, [abcString, apiKey]);

  // 处理代码选中事件
  const handleSelectionChange = useCallback((from: number, to: number) => {
    if (from !== to) {
      setSelectedRange({ from, to });
    } else {
      setSelectedRange(null);
    }
  }, []);

  // 处理编辑器内容变化（带历史记录的防抖更新）
  const pendingHistoryUpdate = useRef<NodeJS.Timeout | null>(null);
  const handleAbcChange = useCallback((newAbc: string) => {
    // 立即更新显示
    setAbcString(newAbc);
    
    // 清除之前的防抖定时器
    if (pendingHistoryUpdate.current) {
      clearTimeout(pendingHistoryUpdate.current);
    }
    
    // 延迟更新历史记录（1秒后）
    pendingHistoryUpdate.current = setTimeout(() => {
      if (newAbc !== history[historyIndex]) {
        updateAbcWithHistory(newAbc);
      }
    }, 1000);
  }, [history, historyIndex]);

  // 渲染：当 abcString 改变时，调用 abcjs 渲染
  useEffect(() => {
    const clickListener = (abcElem: any) => {
      // 五线谱点击事件：定位到对应的代码位置
      if (abcElem && abcElem.startChar !== undefined) {
        const from = Math.max(0, abcElem.startChar);
        const to = Math.min(abcString.length, abcElem.endChar || abcElem.startChar + 1);
        
        // 只有在范围有效时才设置
        if (from <= to && to <= abcString.length) {
          setSelectedRange({ from, to });
        }
      }
    };
    
    let visualObj: any = null;
    
    // 渲染到桌面端容器
    if (notationRef.current) {
      notationRef.current.innerHTML = '';
      visualObj = abcjs.renderAbc(notationRef.current, abcString, {
        responsive: "resize",
        add_classes: true,
        clickListener,
      });
    }
    
    // 渲染到移动端容器
    if (notationMobileRef.current) {
      notationMobileRef.current.innerHTML = '';
      const mobileVisualObj = abcjs.renderAbc(notationMobileRef.current, abcString, {
        responsive: "resize",
        add_classes: true,
        clickListener,
      });
      
      // 如果桌面端没有渲染成功，使用移动端的
      if (!visualObj && mobileVisualObj) {
        visualObj = mobileVisualObj;
      }
    }
    
    // 保存可视化对象用于播放
    if (visualObj && visualObj.length > 0) {
      visualObjRef.current = visualObj[0];
      
      // 标记播放器正在更新
      setIsPlayerUpdating(true);
      setIsPlayerReady(false);
      
      // 延迟初始化播放器（防抖 500ms）
      const timeoutId = setTimeout(() => {
        const initPlayer = async () => {
          try {
            // 清除旧的播放器
            if (synthControlRef.current) {
              try {
                synthControlRef.current.pause();
              } catch (e) {
                // 忽略暂停错误
              }
              synthControlRef.current = null;
            }
            
            // 清空播放器容器（桌面端和移动端）
            const desktopPlayer = document.getElementById("audio-player");
            const mobilePlayer = document.getElementById("audio-player-mobile");
            
            if (desktopPlayer) {
              desktopPlayer.innerHTML = '';
            }
            if (mobilePlayer) {
              mobilePlayer.innerHTML = '';
            }
            
            // 根据屏幕尺寸选择容器
            const isMobile = window.innerWidth < 768;
            const playerSelector = isMobile ? "#audio-player-mobile" : "#audio-player";
            
            // 创建新的播放器实例
            const synthControl = new abcjs.synth.SynthController();
            synthControl.load(playerSelector, null, {
              displayLoop: true,
              displayRestart: true,
              displayPlay: true,
              displayProgress: true,
              displayWarp: true,
            });

            // 加载乐谱
            await synthControl.setTune(visualObj[0], false, {
              program: 0,
              midiTranspose: 0,
            });

            synthControlRef.current = synthControl;
            setIsPlayerReady(true);
            setIsPlaying(false);
            setIsPlayerUpdating(false);
          } catch (err: any) {
            console.error("Failed to initialize player:", err);
            setError("播放器初始化失败：" + err.message);
            setIsPlayerUpdating(false);
          }
        };
        
        initPlayer();
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [abcString]);

  // 高亮选中范围对应的五线谱元素
  useEffect(() => {
    // 清除所有高亮
    const clearHighlights = () => {
      [notationRef.current, notationMobileRef.current].forEach(container => {
        if (container) {
          const allElements = container.querySelectorAll('*');
          allElements.forEach(el => {
            el.classList.remove('abcjs-highlight');
          });
        }
      });
    };

    clearHighlights();

    if (!visualObjRef.current || !selectedRange) {
      return;
    }

    // 添加新的高亮
    try {
      const { from, to } = selectedRange;
      
      // 收集需要高亮的 SVG 元素
      const elementsToHighlight = new Set<SVGElement>();
      
      // 遍历所有音符线条
      if (visualObjRef.current.lines) {
        visualObjRef.current.lines.forEach((line: any) => {
          if (line.staff) {
            line.staff.forEach((staff: any) => {
              if (staff.voices) {
                staff.voices.forEach((voice: any) => {
                  voice.forEach((element: any) => {
                    // 跳过小节线、换行符等非音符元素
                    if (element.el_type === 'bar' || element.el_type === 'clef' || 
                        element.el_type === 'keySignature' || element.el_type === 'timeSignature') {
                      return;
                    }
                    
                    // 检查元素是否在选中范围内
                    if (element.startChar !== undefined && element.endChar !== undefined) {
                      const elementStart = element.startChar;
                      const elementEnd = element.endChar;
                      
                      // 元素必须完全或部分在选中范围内
                      const isInRange = elementStart < to && elementEnd > from;
                      
                      if (isInRange && element.abselem) {
                        // 高亮音符相关的所有 SVG 元素
                        // elemset 包含符头、符尾等
                        if (element.abselem.elemset) {
                          element.abselem.elemset.forEach((svgEl: any) => {
                            if (svgEl && svgEl.tagName) {
                              elementsToHighlight.add(svgEl);
                            }
                          });
                        }
                        
                        // 高亮符杠 (beams)
                        if (element.abselem.beams) {
                          element.abselem.beams.forEach((beam: any) => {
                            if (beam.elem) {
                              elementsToHighlight.add(beam.elem);
                            }
                          });
                        }
                        
                        // 高亮连音线 (ties)
                        if (element.abselem.ties) {
                          element.abselem.ties.forEach((tie: any) => {
                            if (tie.elem) {
                              elementsToHighlight.add(tie.elem);
                            }
                          });
                        }
                      }
                    }
                  });
                });
              }
            });
          }
        });
      }
      
      // 应用高亮
      elementsToHighlight.forEach(el => {
        if (el.classList) {
          el.classList.add('abcjs-highlight');
        }
      });
    } catch (err) {
      console.error("Error highlighting notation:", err);
    }
  }, [selectedRange]);

  // ---------------------------------------------------------------------------
  // 4. 播放器控制逻辑（使用 abcjs 内置播放器）
  // ---------------------------------------------------------------------------
  // 播放器现在通过 abcjs.synth.SynthController 自动管理
  // 所有控制都在内置 UI 中完成

  // ---------------------------------------------------------------------------
  // 5. 历史记录管理
  // ---------------------------------------------------------------------------

  const updateAbcWithHistory = (newAbc: string) => {
    // 清除当前位置之后的历史
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newAbc);
    
    // 限制历史记录数量（最多50条）
    if (newHistory.length > 50) {
      newHistory.shift();
    } else {
      setHistoryIndex(historyIndex + 1);
    }
    
    setHistory(newHistory);
    setAbcString(newAbc);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setAbcString(history[newIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setAbcString(history[newIndex]);
    }
  };

  // ---------------------------------------------------------------------------
  // 6. 交互逻辑 (AI 调用)
  // ---------------------------------------------------------------------------

  const handleAiEdit = async () => {
    if (!apiKey) {
      setShowSettings(true);
      setError("请先在设置中输入 OpenAI API Key");
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
        throw new Error(data.error?.message || "API 请求失败: " + (data.error?.message || "未知错误"));
      }

      let newAbc = data.choices[0].message.content;

      // 清理可能存在的 Markdown 标记 (以防万一)
      newAbc = newAbc.replace(/```abc/g, "").replace(/```/g, "").trim();

      updateAbcWithHistory(newAbc);
      setPrompt(""); // 清空输入框
    } catch (err: any) {
      setError(err.message || "发生未知错误");
    } finally {
      setIsLoading(false);
    }
  };

  // 加载示例模板
  const loadTemplate = (template: typeof EXAMPLE_TEMPLATES[0]) => {
    updateAbcWithHistory(template.abc);
    setShowTemplates(false);
  };

  // 导出为 MIDI
  const handleExportMidi = () => {
    if (!visualObjRef.current) {
      setError("请先加载乐谱");
      return;
    }

    try {
      const midi = abcjs.synth.getMidiFile(abcString, {
        midiOutputType: "binary",
      });
      
      const blob = new Blob([midi], { type: "audio/midi" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "music.mid";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError("导出 MIDI 失败: " + err.message);
    }
  };

  // 导出为 PDF（打印功能）
  const handleExportPDF = () => {
    if (!visualObjRef.current) {
      setError("请先加载乐谱");
      return;
    }

    // 创建一个打印专用的窗口
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError("无法打开打印窗口，请检查浏览器弹窗设置");
      return;
    }

    // 获取乐谱 SVG
    const svgElement = notationRef.current?.querySelector('svg');
    if (!svgElement) {
      setError("无法获取乐谱内容");
      printWindow.close();
      return;
    }

    // 构建打印页面
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Print Music Sheet</title>
        <style>
          @media print {
            body { margin: 0; padding: 20px; }
            svg { max-width: 100%; height: auto; }
          }
          body { 
            font-family: Arial, sans-serif; 
            margin: 20px;
          }
          svg { 
            max-width: 100%; 
            height: auto; 
            display: block;
          }
        </style>
      </head>
      <body>
        ${svgElement.outerHTML}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  // 导出为音频（WAV）
  const handleExportAudio = async () => {
    if (!visualObjRef.current) {
      setError("请先加载乐谱");
      return;
    }

    try {
      setIsLoading(true);
      
      // 创建临时的合成器
      const synth = new abcjs.synth.CreateSynth();
      await synth.init({
        audioContext: new AudioContext(),
        visualObj: visualObjRef.current,
        options: {
          program: 0,
          midiTranspose: 0,
        }
      });

      await synth.prime();
      
      // 获取音频数据
      const audio = synth.download();
      
      if (audio) {
        const blob = new Blob([audio], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "music.wav";
        a.click();
        URL.revokeObjectURL(url);
      } else {
        setError("导出音频失败：无法生成音频数据");
      }
    } catch (err: any) {
      console.error("Export audio error:", err);
      setError("导出音频失败: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 7. 键盘快捷键
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Z: 撤销
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Cmd/Ctrl + Shift + Z: 重做
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
      // Cmd/Ctrl + Enter: 发送 AI 请求
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleAiEdit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history, prompt, apiKey, abcString]);

  // ---------------------------------------------------------------------------
  // 8. 界面渲染
  // ---------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 font-sans">
      {/* 顶部导航 */}
      <header className="flex justify-between items-center px-3 py-2 sm:px-4 sm:py-3 bg-white border-b border-gray-200 shadow-sm z-10">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {/* Logo - 移动端精简版 */}
          <h1 className="text-base sm:text-xl font-bold text-indigo-600 truncate">
            <span className="hidden sm:inline">🎹 AI Music Editor</span>
            <span className="sm:hidden">🎹 AI 音乐</span>
          </h1>
          
          {/* 桌面端按钮 */}
          <div className="hidden md:flex gap-1">
            <button
              onClick={() => setShowTemplates(true)}
              className="px-3 py-1 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors whitespace-nowrap"
              title="选择模板"
            >
              📑 模板
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="px-3 py-1 text-sm text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors whitespace-nowrap"
              title="帮助"
            >
              ❓ 帮助
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2">
          {/* 撤销/重做 - 桌面端显示 */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="撤销 (Cmd/Ctrl+Z)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="重做 (Cmd/Ctrl+Shift+Z)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6-6m6 6l-6 6" />
              </svg>
            </button>
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
          </div>
          
          {/* 导出按钮 - 移动端改为点击 */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="p-2 sm:px-3 sm:py-1 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors flex items-center gap-1"
              title="导出"
            >
              <span className="text-lg sm:text-base">💾</span>
              <span className="hidden lg:inline text-sm">导出</span>
              <svg className="hidden sm:block w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {/* 导出下拉菜单 */}
            {showExportMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40"
                  onClick={() => setShowExportMenu(false)}
                ></div>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
                  <button
                    onClick={() => {
                      handleExportMidi();
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 rounded-t-lg active:bg-indigo-100"
                  >
                    <span>🎹</span>
                    <span>导出 MIDI</span>
                  </button>
                  <button
                    onClick={() => {
                      handleExportPDF();
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 active:bg-indigo-100"
                  >
                    <span>📄</span>
                    <span>打印/导出 PDF</span>
                  </button>
                  <button
                    onClick={() => {
                      handleExportAudio();
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center gap-2 rounded-b-lg active:bg-indigo-100"
                  >
                    <span>🔊</span>
                    <span>导出音频 (WAV)</span>
                  </button>
                </div>
              </>
            )}
          </div>
          
          {/* 设置按钮 */}
          <button
            onClick={() => setShowSettings(true)}
            className={`p-2 rounded transition-colors ${apiKey ? 'text-green-600 hover:bg-green-50' : 'text-red-600 hover:bg-red-50'}`}
            title="设置"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          
          {/* 移动端菜单按钮 */}
          <button
            onClick={() => setShowMobileMenu(true)}
            className="md:hidden p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
            title="菜单"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* 主工作区 */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        
        {/* Loading 遮罩层 */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/80 z-50 flex flex-col items-center justify-center backdrop-blur-sm">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500 border-t-transparent"></div>
            <p className="mt-4 text-indigo-600 font-medium">🎼 AI 正在谱曲中...</p>
          </div>
        )}

        {/* 桌面端：左右分栏布局 */}
        <div className="hidden md:flex flex-1 overflow-hidden">
          {/* 左侧：编辑器 & 对话 */}
          <div className="w-1/3 flex flex-col border-r border-gray-200 bg-white min-h-0">
            
            {/* 代码编辑器 */}
            <div className="flex-1 p-4 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                  <span>ABC 乐谱代码</span>
                  <span className="text-xs font-normal text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">高亮</span>
              </label>
                <span className="text-xs text-gray-400">
                  {abcString.split('\n').length} 行
                </span>
              </div>
              <AbcEditor
                value={abcString}
                onChange={handleAbcChange}
                onSelectionChange={handleSelectionChange}
                selectedRange={selectedRange}
                disabled={isLoading}
              />
              <div className="mt-2 text-xs text-gray-500">
                💡 提示：选中代码可高亮对应的五线谱，点击五线谱可定位代码
              </div>
            </div>

            {/* AI 对话框 */}
            <div className="p-4 border-t border-gray-200 bg-gradient-to-b from-gray-50 to-white">
              {error && (
                <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 p-3 rounded-lg flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <div className="font-semibold">出错了</div>
                    <div className="text-xs mt-1">{error}</div>
                  </div>
                  <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              )}
              
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  💬 让 AI 帮你修改
                </label>
                
                {/* AI 建议快捷按钮 */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {AI_SUGGESTIONS.slice(0, 3).map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setPrompt(suggestion)}
                      className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors whitespace-nowrap"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="例如：改为 G 大调，或者把节奏改快一点..."
                  className="w-full p-3 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none h-24 resize-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAiEdit();
                    }
                  }}
                  disabled={isLoading}
                />
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs text-gray-400 truncate">
                    {!apiKey && "⚠️ 请先设置 API Key"}
                  </span>
                <button
                  onClick={handleAiEdit}
                    disabled={isLoading || !prompt.trim() || !apiKey}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg whitespace-nowrap"
                >
                    {isLoading ? "处理中..." : "发送 AI ✨"}
                </button>
                </div>
              </div>
            </div>
          </div>

          {/* 右侧：乐谱预览 */}
          <div className={`flex-1 flex flex-col p-6 overflow-auto bg-gradient-to-br from-gray-50 to-gray-100 transition-opacity duration-300 ${isLoading ? 'opacity-50' : 'opacity-100'}`}>
            {/* 播放器控制区 */}
            <div className="max-w-5xl w-full mx-auto mb-4">
              <div className="bg-white rounded-sm shadow-md p-4"
                   style={{
                     boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)'
                   }}>
                <div className="flex items-center gap-3 mb-3">
                  <svg className="w-5 h-5 text-indigo-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                  </svg>
                  <h3 className="font-semibold text-gray-900">音频播放器</h3>
                  {isPlayerUpdating && (
                    <span className="text-xs text-amber-600 ml-auto flex items-center gap-1 whitespace-nowrap">
                      <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      正在更新...
                    </span>
                  )}
                  {!isPlayerReady && !isPlayerUpdating && (
                    <span className="text-xs text-gray-500 ml-auto">等待乐谱加载</span>
                  )}
                  {isPlayerReady && !isPlayerUpdating && (
                    <span className="text-xs text-green-600 ml-auto flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      就绪
                    </span>
                  )}
                </div>
                {/* abcjs 内置播放器 UI */}
                <div 
                  id="audio-player" 
                  className={`min-h-[80px] ${isPlayerUpdating ? 'opacity-50' : 'opacity-100'}`}
                  style={{ width: '100%' }}
                ></div>
              </div>
            </div>

            {/* 乐谱显示区 - 纸张效果 */}
            <div className="max-w-5xl w-full mx-auto flex-1">
              {/* 纸张容器 */}
              <div className="bg-white shadow-2xl rounded-sm min-h-[500px] relative" 
                   style={{
                     backgroundImage: 'linear-gradient(to bottom, #fafafa 0%, #ffffff 100%)',
                     boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 8px 32px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(0,0,0,0.05)'
                   }}>
                {/* 纸张顶部装饰线 */}
                <div className="absolute top-0 left-0 right-0 h-12 border-b border-red-200 bg-gradient-to-b from-red-50/30 to-transparent"></div>
                
                {/* 乐谱内容区 */}
                <div className="px-12 py-16">
                  {/* 乐谱显示 */}
                  <div ref={notationRef} id="paper" className="w-full min-h-[300px]"></div>
                  
                  {/* 如果乐谱为空的提示 */}
                  {!abcString && (
                    <div className="text-center text-gray-400 mt-20">
                      <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                      </svg>
                      <p className="text-lg">还没有乐谱</p>
                      <p className="text-sm mt-2">开始编辑代码，或者让 AI 帮你创作！</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 移动端：Tabs 布局 */}
        <div className="md:hidden flex-1 flex flex-col overflow-hidden">
          {/* Tab 切换栏 */}
          <div className="flex border-b border-gray-200 bg-white">
            <button
              onClick={() => setMobileTab('editor')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'editor'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span>编辑器</span>
              </div>
            </button>
            <button
              onClick={() => setMobileTab('notation')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'notation'
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/50'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                </svg>
                <span>五线谱</span>
              </div>
            </button>
          </div>

          {/* Tab 内容区 */}
          <div className="flex-1 overflow-hidden relative">
            {/* 编辑器标签页 */}
            <div className={`absolute inset-0 bg-white ${mobileTab === 'editor' ? 'block' : 'hidden'}`}>
              <div className="h-full flex flex-col p-3">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                    <span>代码</span>
                    <span className="text-xs font-normal text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">高亮</span>
                  </label>
                  <span className="text-xs text-gray-400">
                    {abcString.split('\n').length} 行
                  </span>
                </div>
                <div className="flex-1 min-h-0">
                  <AbcEditor
                    value={abcString}
                    onChange={handleAbcChange}
                    onSelectionChange={handleSelectionChange}
                    selectedRange={selectedRange}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            {/* 五线谱标签页 */}
            <div className={`absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100 overflow-auto ${mobileTab === 'notation' ? 'block' : 'hidden'}`}>
              <div className="p-3 h-full">
                {/* 纸张容器 */}
                <div className="bg-white shadow-2xl rounded-sm min-h-full relative" 
                     style={{
                       backgroundImage: 'linear-gradient(to bottom, #fafafa 0%, #ffffff 100%)',
                       boxShadow: '0 1px 3px rgba(0,0,0,0.12), 0 8px 32px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(0,0,0,0.05)'
                     }}>
                  {/* 纸张顶部装饰线 */}
                  <div className="absolute top-0 left-0 right-0 h-8 border-b border-red-200 bg-gradient-to-b from-red-50/30 to-transparent"></div>
                  
                  {/* 乐谱内容区 - 移动端专用容器 */}
                  <div className="px-4 py-10">
                    <div ref={notationMobileRef} className="w-full min-h-[200px]"></div>
                    
                    {/* 空状态提示 */}
                    {!abcString && (
                      <div className="text-center text-gray-400 mt-20">
                        <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                        <p className="text-base">还没有乐谱</p>
                        <p className="text-sm mt-2">切换到编辑器开始创作！</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 移动端底部区域：播放器 + AI 对话 */}
          <div className="flex-none border-t-2 border-gray-200 bg-white shadow-lg">
            {/* 播放器 */}
            <div className="p-3 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-indigo-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" />
                </svg>
                <h3 className="font-semibold text-gray-900 text-sm">播放器</h3>
                {isPlayerUpdating && (
                  <span className="text-xs text-amber-600 ml-auto flex items-center gap-1">
                    <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </span>
                )}
                {isPlayerReady && !isPlayerUpdating && (
                  <span className="text-xs text-green-600 ml-auto flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </div>
              <div 
                id="audio-player-mobile" 
                className={`min-h-[60px] ${isPlayerUpdating ? 'opacity-50' : 'opacity-100'}`}
                style={{ width: '100%' }}
              ></div>
            </div>

            {/* AI 对话框 */}
            <div className="p-3 bg-gradient-to-b from-gray-50 to-white">
              {error && (
                <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 p-2 rounded-lg flex items-start gap-2">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1 text-xs">
                    <div className="font-semibold">出错了</div>
                    <div className="mt-0.5">{error}</div>
                  </div>
                  <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              )}
              
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  💬 AI 辅助
                </label>
                
                {/* AI 建议快捷按钮 */}
                <div className="flex flex-wrap gap-1 mb-1">
                  {AI_SUGGESTIONS.slice(0, 3).map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setPrompt(suggestion)}
                      className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors active:bg-indigo-100 whitespace-nowrap"
                    >
                      {suggestion}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowMobileMenu(true)}
                    className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors"
                  >
                    更多...
                  </button>
                </div>
                
                <div className="flex gap-2">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="例如：改为 G 大调..."
                    className="flex-1 p-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none h-16 resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAiEdit();
                      }
                    }}
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleAiEdit}
                    disabled={isLoading || !prompt.trim() || !apiKey}
                    className="px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md whitespace-nowrap self-end"
                  >
                    {isLoading ? "..." : "发送"}
                  </button>
                </div>
                {!apiKey && (
                  <span className="text-xs text-red-600">⚠️ 请先设置 API Key</span>
                )}
              </div>
            </div>
          </div>
        </div>

      </main>

      {/* ======================================== */}
      {/* 弹窗和面板 */}
      {/* ======================================== */}

      {/* 欢迎弹窗 */}
      {showWelcome && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 sm:p-8">
              <h2 className="text-2xl sm:text-3xl font-bold text-indigo-600 mb-3 sm:mb-4">🎹 欢迎使用 AI Music Editor！</h2>
              
              <div className="space-y-3 sm:space-y-4 text-gray-700">
                <p className="text-base sm:text-lg">这是一个使用 ABC 记谱法和 AI 技术的智能音乐编辑器。</p>
                
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <h3 className="font-semibold text-indigo-900 mb-2">✨ 主要功能：</h3>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-600">•</span>
                      <span><strong>实时编辑：</strong>左侧编辑 ABC 代码（带语法高亮），右侧即时预览乐谱</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-600">•</span>
                      <span><strong>双向交互：</strong>选中代码高亮五线谱，点击五线谱定位代码</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-600">•</span>
                      <span><strong>AI 辅助：</strong>用自然语言描述你想要的修改，AI 帮你实现</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-600">•</span>
                      <span><strong>音频播放：</strong>点击播放按钮即可听到你的作品</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-600">•</span>
                      <span><strong>撤销/重做：</strong>支持历史记录，随时回退修改</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-600">•</span>
                      <span><strong>导出功能：</strong>支持导出 MIDI、PDF 和音频文件</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="font-semibold text-yellow-900 mb-2">🚀 快速开始：</h3>
                  <ol className="space-y-2 text-sm list-decimal list-inside">
                    <li>点击右上角的 ⚙️ 设置按钮，输入你的 OpenAI API Key</li>
                    <li>从 📑 模板中选择一个示例乐谱开始</li>
                    <li>在 AI 对话框中输入修改需求，例如"改为 G 大调"</li>
                    <li>点击播放按钮欣赏你的作品</li>
                  </ol>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">⌨️ 快捷键：</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><kbd className="px-2 py-1 bg-white border rounded">Cmd/Ctrl+Z</kbd> 撤销</div>
                    <div><kbd className="px-2 py-1 bg-white border rounded">Cmd/Ctrl+Shift+Z</kbd> 重做</div>
                    <div><kbd className="px-2 py-1 bg-white border rounded">Cmd/Ctrl+Enter</kbd> 发送 AI 请求</div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowWelcome(false)}
                className="mt-6 w-full px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-md"
              >
                开始创作 🎵
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 设置面板 */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-5 sm:p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">⚙️ 设置</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    OpenAI API Key
                  </label>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    你的 API Key 只会保存在本地浏览器中，不会上传到服务器。
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-blue-900 mb-2">💡 如何获取 API Key？</h3>
                  <ol className="text-xs text-blue-800 space-y-1 list-decimal list-inside">
                    <li>访问 <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" className="underline">platform.openai.com</a></li>
                    <li>登录或注册账号</li>
                    <li>进入 API Keys 页面</li>
                    <li>创建新的 API Key 并复制</li>
                  </ol>
                </div>

                {apiKey && (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>API Key 已设置</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowSettings(false)}
                className="mt-6 w-full px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 帮助面板 */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 sm:p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">❓ 使用帮助</h2>
                <button
                  onClick={() => setShowHelp(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-6">
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">📚 什么是 ABC 记谱法？</h3>
                  <p className="text-gray-700 text-sm mb-3">
                    ABC 记谱法是一种用 ASCII 字符表示音乐的文本格式，简单易学。
                  </p>
                  <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm">
                    <div className="text-gray-600">X:1          <span className="text-gray-500">// 曲目编号</span></div>
                    <div className="text-gray-600">T:My Song    <span className="text-gray-500">// 标题</span></div>
                    <div className="text-gray-600">M:4/4        <span className="text-gray-500">// 拍号</span></div>
                    <div className="text-gray-600">L:1/4        <span className="text-gray-500">// 默认音符长度</span></div>
                    <div className="text-gray-600">K:C          <span className="text-gray-500">// 调号</span></div>
                    <div className="text-gray-600">C D E F      <span className="text-gray-500">// 音符</span></div>
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">🎵 常用音符表示：</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-gray-50 rounded p-3">
                      <div className="font-mono font-bold">C D E F G A B</div>
                      <div className="text-gray-600">中音区（小写）</div>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <div className="font-mono font-bold">c d e f g a b</div>
                      <div className="text-gray-600">高音区（大写）</div>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <div className="font-mono font-bold">C2  C/2</div>
                      <div className="text-gray-600">二分音符 / 八分音符</div>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <div className="font-mono font-bold">^C  _C  =C</div>
                      <div className="text-gray-600">升 / 降 / 还原</div>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">🎨 编辑器功能：</h3>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-indigo-600">语法高亮：</span>
                      <span>不同颜色标识音符、时值、小节线等，更易阅读</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-green-600">选中→高亮：</span>
                      <span>在编辑器中选中代码，五线谱上对应部分会高亮显示</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold text-blue-600">点击→定位：</span>
                      <span>点击五线谱上的音符，编辑器自动跳转到对应代码</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">🤖 AI 使用技巧：</h3>
                  <ul className="space-y-2 text-sm text-gray-700">
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-600 font-bold">•</span>
                      <span>使用简单明确的指令："改为 G 大调"、"加快节奏"</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-600 font-bold">•</span>
                      <span>可以要求添加元素："添加和弦符号"、"加装饰音"</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-600 font-bold">•</span>
                      <span>可以请求创作风格："改成爵士风格"、"添加复调"</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-indigo-600 font-bold">•</span>
                      <span>使用快捷建议按钮快速输入常见指令</span>
                    </li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">💾 导出功能：</h3>
                  <div className="space-y-2 text-sm text-gray-700">
                    <div className="flex items-start gap-2">
                      <span className="font-bold">🎹 MIDI：</span>
                      <span>导出为 MIDI 文件，可在任何支持 MIDI 的软件中使用</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold">📄 PDF：</span>
                      <span>打印或保存乐谱为 PDF 文件，方便分享和打印</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="font-bold">🔊 音频：</span>
                      <span>导出为 WAV 音频文件，可直接在播放器中播放</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">🔗 更多资源：</h3>
                  <ul className="space-y-2 text-sm">
                    <li>
                      <a href="https://abcnotation.com/" target="_blank" rel="noopener noreferrer" 
                         className="text-indigo-600 hover:text-indigo-800 underline">
                        ABC Notation 官方网站
                      </a>
                    </li>
                    <li>
                      <a href="https://paulrosen.github.io/abcjs/" target="_blank" rel="noopener noreferrer" 
                         className="text-indigo-600 hover:text-indigo-800 underline">
                        abcjs 文档
                      </a>
                    </li>
                  </ul>
                </section>
              </div>

              <button
                onClick={() => setShowHelp(false)}
                className="mt-6 w-full px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 移动端菜单 */}
      {showMobileMenu && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center backdrop-blur-sm md:hidden">
          <div 
            className="absolute inset-0"
            onClick={() => setShowMobileMenu(false)}
          ></div>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md relative animate-slide-up">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">菜单</h2>
                <button
                  onClick={() => setShowMobileMenu(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-2">
                {/* 撤销/重做 */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      handleUndo();
                      setShowMobileMenu(false);
                    }}
                    disabled={historyIndex <= 0}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-gray-700 bg-gray-50 hover:bg-indigo-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:bg-indigo-100"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    <span>撤销</span>
                  </button>
                  <button
                    onClick={() => {
                      handleRedo();
                      setShowMobileMenu(false);
                    }}
                    disabled={historyIndex >= history.length - 1}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-gray-700 bg-gray-50 hover:bg-indigo-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:bg-indigo-100"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6-6m6 6l-6 6" />
                    </svg>
                    <span>重做</span>
                  </button>
                </div>

                {/* 模板 */}
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    setShowTemplates(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 bg-gray-50 hover:bg-indigo-50 rounded-lg transition-colors active:bg-indigo-100"
                >
                  <span className="text-xl">📑</span>
                  <span>选择模板</span>
                </button>

                {/* 帮助 */}
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    setShowHelp(true);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 bg-gray-50 hover:bg-indigo-50 rounded-lg transition-colors active:bg-indigo-100"
                >
                  <span className="text-xl">❓</span>
                  <span>使用帮助</span>
                </button>

                {/* AI 建议 */}
                <div className="pt-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">AI 快捷建议</div>
                  <div className="flex flex-wrap gap-2">
                    {AI_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => {
                          setPrompt(suggestion);
                          setShowMobileMenu(false);
                        }}
                        className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 transition-colors active:bg-indigo-100"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 模板选择面板 */}
      {showTemplates && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-5 sm:p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">📑 选择模板</h2>
                <button
                  onClick={() => setShowTemplates(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {EXAMPLE_TEMPLATES.map((template, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => loadTemplate(template)}
                  >
                    <h3 className="font-semibold text-gray-900 mb-2">{template.name}</h3>
                    <pre className="bg-gray-50 rounded p-3 text-xs font-mono text-gray-600 overflow-x-auto">
                      {template.abc}
                    </pre>
                    <button
                      className="mt-3 w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 transition-colors"
                    >
                      使用此模板
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowTemplates(false)}
                className="mt-6 w-full px-4 py-2 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors"
              >
                取消
              </button>
                </div>
           </div>
        </div>
      )}
    </div>
  );
}