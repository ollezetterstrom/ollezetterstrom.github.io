import { Logger } from './logger.js';
import { SFX } from './audio.js';

const style = document.createElement('style');
style.innerHTML = `
    .cinematic-mode { background: #000 !important; transition: background 0.3s; }
    .cinematic-bars { position: fixed; left: 0; width: 100%; height: 12vh; background: #000; z-index: 1000; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
    .cinematic-bars.top { top: 0; transform: translateY(-100%); }
    .cinematic-bars.bottom { bottom: 0; transform: translateY(100%); }
    .cinematic-bars.active { transform: translateY(0); }
    
    .impact-frame { position: fixed; inset: 0; background: white; z-index: 999; opacity: 0; pointer-events: none; mix-blend-mode: exclusion; }
    .impact-active { animation: strobe 0.1s steps(2, end) infinite; opacity: 1; }
    @keyframes strobe { 0% { background: white; } 50% { background: black; } 100% { background: white; } }

    .speed-lines { position: fixed; inset: 0; pointer-events: none; z-index: 900; opacity: 0;
        background: repeating-radial-gradient(circle at center, transparent 0, transparent 4px, rgba(0,0,0,0.1) 5px, rgba(0,0,0,0.3) 6px);
        animation: spin 4s linear infinite; transition: opacity 0.2s; }
    .speed-lines.active { opacity: 1; }
    @keyframes spin { 100% { transform: rotate(360deg) scale(2); } }

    /* REMOVED GRAYSCALE FILTER HERE */
    .manga-panel {
        position: fixed; top: 50%; left: 75%; transform: translate(-50%, -50%) skew(-5deg) scale(0);
        border: 8px solid white; box-shadow: 15px 15px 0px rgba(0,0,0,0.8);
        z-index: 950; object-fit: cover; max-height: 50vh; max-width: 35vw;
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), filter 0.5s;
    }
    .manga-panel.show { transform: translate(-50%, -50%) skew(-5deg) scale(1); }
    
    /* MODIFIED COLOR BURST TO JUST ENHANCE THE COLOR, NOT REVERT GRAYSCALE */
    .manga-panel.color-burst { filter: contrast(110%) brightness(115%); box-shadow: 0 0 50px #F59E0B; border-color: #F59E0B;}

    .text-panel {
        position: fixed; top: 50%; left: 75%; transform: translate(-50%, -50%) skew(-5deg) scale(0);
        border: 8px solid white; box-shadow: 15px 15px 0px rgba(0,0,0,0.8);
        z-index: 950; width: 30vw; height: 30vw; max-height: 50vh;
        background: repeating-linear-gradient(45deg, #000, #000 15px, #222 15px, #222 30px);
        color: white; display: flex; align-items: center; justify-content: center;
        font-size: 4vw; font-weight: 900; text-transform: uppercase; font-family: 'Impact', sans-serif;
        text-align: center; word-break: break-word; padding: 20px;
        transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    .text-panel.show { transform: translate(-50%, -50%) skew(-5deg) scale(1); }
    .text-panel.color-burst { background: repeating-linear-gradient(45deg, #F59E0B, #F59E0B 15px, #D97706 15px, #D97706 30px); color: #000; }

    .screen-shake { animation: shake 0.2s infinite; }
    @keyframes shake { 0% { transform: translate(2px, 1px) rotate(0deg); } 10% { transform: translate(-1px, -2px) rotate(-1deg); } 20% { transform: translate(-3px, 0px) rotate(1deg); } 30% { transform: translate(0px, 2px) rotate(0deg); } 40% { transform: translate(1px, -1px) rotate(1deg); } 50% { transform: translate(-1px, 2px) rotate(-1deg); } 60% { transform: translate(-3px, 1px) rotate(0deg); } 70% { transform: translate(2px, 1px) rotate(-1deg); } 80% { transform: translate(-1px, -1px) rotate(1deg); } 90% { transform: translate(2px, 2px) rotate(0deg); } 100% { transform: translate(1px, -2px) rotate(-1deg); } }
    
    .node-trace { transition: all 0.3s ease !important; }

    .fallback-caption {
        position: fixed;
        left: 75%;
        top: calc(50% + 25vh + 10px);
        transform: translateX(-50%);
        font-size: 12px;
        color: #aaa;
        text-align: center;
        z-index: 951;
        font-family: 'Inter', sans-serif;
        text-transform: uppercase;
        letter-spacing: 1px;
        opacity: 0;
        transition: opacity 0.2s;
    }
    .fallback-caption.show { opacity: 1; }
`;
document.head.appendChild(style);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchSummaryImage(word) {
    try {
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.thumbnail?.source) {
            return { url: data.thumbnail.source, title: data.title };
        }
    } catch (e) { /* fallback to search */ }
    return null;
}

async function fetchWikipediaImage(word) {
    try {
        const res = await fetch(
            `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(word)}&gsrlimit=20&prop=pageimages&format=json&pithumbsize=600&redirects=1&origin=*`
        );
        const data = await res.json();
        
        if (data.query?.pages) {
            const pagesArray = Object.values(data.query.pages)
                .sort((a, b) => a.index - b.index);

            const BAD_TITLE = /\(disambiguation\)|^List\sof|^Portal:|^Category:/i;

            for (const page of pagesArray) {
                if (page.pageid && page.thumbnail && !BAD_TITLE.test(page.title)) {
                    Logger.debug(`Found image for "${word}" on page: ${page.title}`);
                    return {
                        url: page.thumbnail.source,
                        title: page.title,
                    };
                }
            }
        }
    } catch (e) {
        Logger.error(`Wiki image fetch failed for ${word}`, e);
    }
    return null;
}

async function getSmartImageFallback(word) {
    // 1. Try REST Summary API (Highest quality)
    let imgData = await fetchSummaryImage(word);
    if (imgData) return imgData;

    // 2. Try the search API
    imgData = await fetchWikipediaImage(word);
    if (imgData) return imgData;

    // 3. Try a more "concrete" search query
    Logger.debug(`No visual for "${word}". Trying concrete search...`);
    imgData = await fetchWikipediaImage(`${word} object`);
    if (imgData) return imgData;

    // 4. Engaging Datamuse with noun filtering
    Logger.warn(`No visual for "${word}". Engaging Datamuse related-word fallback...`);

    try {
        const dmRes = await fetch(`https://api.datamuse.com/words?ml=${word}&max=15`);
        const relatedWords = await dmRes.json();

        for (const item of relatedWords) {
            const w = item.word;
            // Skip highly abstract or too short/long words
            if (w.length < 4 || w.startsWith('un') || w.startsWith('re') ||
                w.endsWith('ness') || w.endsWith('ity') || w.endsWith('ism') || 
                w.endsWith('ance') || w.endsWith('ence') || w.endsWith('able') || w.endsWith('ible')) {
                Logger.debug(`Skipping abstract/invalid related word: "${w}"`);
                continue;
            }

            Logger.debug(`Trying related word: "${w}" (score: ${item.score})`);
            imgData = await fetchWikipediaImage(w);
            if (imgData) {
                Logger.success(`Fallback success! Using image for "${w}" instead of "${word}"`);
                return imgData;
            }
        }
    } catch (e) {
        Logger.warn("Datamuse API failed.");
    }

    return null;
}

export async function runAnimeCutscene(path, panzoom, container) {
    Logger.divider();
    Logger.info("🎬 DIRECTING ANIME CUTSCENE - FULL COLOR MODE...");

    const board = document.getElementById('board');
    if (panzoom && panzoom.pause) panzoom.pause();

    const imagePromises = path.map(node => getSmartImageFallback(node.word));

    Logger.info("Tracing the winning path...");
    for (let i = 0; i < path.length; i++) {
        const node = path[i];
        node.el.classList.add('node-trace');
        node.el.style.backgroundColor = '#10B981';
        node.el.style.borderColor = '#059669';
        node.el.style.color = '#FFF';
        node.el.style.boxShadow = '0 0 15px rgba(16, 185, 129, 0.8)';
        node.el.style.transform = 'translate(-50%, -50%) scale(1.1)';
        node.el.style.zIndex = '800';

        SFX.playTrace();
        await sleep(250);
    }

    await sleep(200);

    const preloadedImages = await Promise.all(imagePromises);
    const panels = [];
    const captions = [];

    for (let i = 0; i < path.length; i++) {
        const imgData = preloadedImages[i];
        const word = path[i].word;
        let panelEl;
        let captionEl = null;

        if (imgData) {
            panelEl = document.createElement('img');
            panelEl.className = 'manga-panel';
            panelEl.src = imgData.url;

            // If the source title/word is different from the original word, show a caption
            // We compare lowercase for a loose match
            if (imgData.title.toLowerCase() !== word.toLowerCase()) {
                captionEl = document.createElement('div');
                captionEl.className = 'fallback-caption';
                captionEl.innerText = `~ ${imgData.title}`;
                document.body.appendChild(captionEl);
            }
        } else {
            panelEl = document.createElement('div');
            panelEl.className = 'text-panel';
            panelEl.innerText = word;
        }

        document.body.appendChild(panelEl);
        panels.push(panelEl);
        captions.push(captionEl);
    }

    Logger.info("Transitioning to Action Phase...");
    const topBar = document.createElement('div'); topBar.className = 'cinematic-bars top';
    const bottomBar = document.createElement('div'); bottomBar.className = 'cinematic-bars bottom';
    const impact = document.createElement('div'); impact.className = 'impact-frame';
    const lines = document.createElement('div'); lines.className = 'speed-lines';

    document.body.append(topBar, bottomBar, impact, lines);
    container.classList.add('cinematic-mode');
    board.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';

    setTimeout(() => { topBar.classList.add('active'); bottomBar.classList.add('active'); }, 50);
    await sleep(400);

    for (let i = 0; i < path.length; i++) {
        const node = path[i];
        const isLast = (i === path.length - 1);
        const panelEl = panels[i];

        impact.classList.add('impact-active');
        document.body.classList.add('screen-shake');
        lines.classList.add('active');
        SFX.playCinematicImpact();

        const scale = isLast ? 3.5 : 2.5;
        const targetX = window.innerWidth * 0.3;
        const targetY = window.innerHeight * 0.5;

        board.style.transformOrigin = `${node.x}px ${node.y}px`;
        board.style.transform = `translate(${targetX - node.x}px, ${targetY - node.y}px) scale(${scale})`;

        node.el.style.backgroundColor = isLast ? '#F59E0B' : '#000';
        node.el.style.transform = 'translate(-50%, -50%) scale(1.5)';
        node.el.style.zIndex = '999';
        if (isLast) node.el.style.boxShadow = '0 0 30px #F59E0B';

        await sleep(100);
        impact.classList.remove('impact-active');
        document.body.classList.remove('screen-shake');

        panelEl.classList.add('show');
        if (captions[i]) captions[i].classList.add('show');

        if (isLast) {
            panelEl.classList.add('color-burst');
            SFX.playCinematicFinal();
        } else {
            SFX.playCinematicReveal();
        }

        await sleep(isLast ? 2500 : 1000);

        panelEl.classList.remove('show');
        if (captions[i]) captions[i].classList.remove('show');
        panelEl.classList.remove('color-burst');
        lines.classList.remove('active');

        node.el.style.transform = 'translate(-50%, -50%) scale(1.1)';
        node.el.style.zIndex = '800';
        node.el.style.backgroundColor = '#10B981';

        await sleep(150);
    }

    topBar.classList.remove('active');
    bottomBar.classList.remove('active');
    container.classList.remove('cinematic-mode');

    setTimeout(() => {
        topBar.remove(); bottomBar.remove(); impact.remove(); lines.remove();
        panels.forEach(p => p.remove());
        captions.forEach(c => c?.remove());

        board.style.transition = '';
        board.style.transformOrigin = '';
        if (panzoom && panzoom.resume) panzoom.resume();

        panzoom.zoom(0.8, { animate: true });
        panzoom.pan(0, 0, { animate: true });
        Logger.success("🎬 Cutscene complete.");
    }, 400);
}