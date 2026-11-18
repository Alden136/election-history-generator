import { useMemo } from 'react';
import type { Timeline } from '../engine/simulate';
import { Icon } from './Icon';
import { storyText, writeStory } from './story';

/** The timeline told as a short history, one chapter per forty years. */
export function StoryPage({ timeline, rules }: {
  timeline: Timeline;
  /** "the Corrected rules", "the Faithful rules with 2 dials adjusted". */
  rules: string;
}) {
  const story = useMemo(() => writeStory(timeline, rules), [timeline, rules]);
  const heading = `The history of seed ${timeline.seed}`;

  function download() {
    const url = URL.createObjectURL(new Blob([storyText(story, `${heading} (${rules})`)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `story-seed-${timeline.seed}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="panel story-panel" aria-labelledby="story-title">
    <div className="history-controls">
      <div><h2 id="story-title">Story</h2><p>{heading} · {rules}</p></div>
      <button className="button secondary" type="button" onClick={download}><Icon name="download" />Download story</button>
    </div>
    <div className="story-body">
      <nav className="story-contents" aria-label="Chapters">
        <ol>{story.chapters.map((chapter) => <li key={chapter.from}>
          <a href={`#chapter-${chapter.from}`} onClick={(event) => {
            event.preventDefault();
            document.getElementById(`chapter-${chapter.from}`)?.scrollIntoView({ block: 'start' });
          }}><span>{chapter.from}–{chapter.to}</span>{chapter.title}</a>
        </li>)}</ol>
      </nav>
      <article className="story-text">
        <p className="story-intro">{story.intro}</p>
        {story.chapters.map((chapter) => <section key={chapter.from} id={`chapter-${chapter.from}`} aria-labelledby={`chapter-title-${chapter.from}`}>
          <h3 id={`chapter-title-${chapter.from}`}><span>{chapter.from}–{chapter.to}</span>{chapter.title}</h3>
          {chapter.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
        </section>)}
        <p className="story-ending">{story.ending}</p>
      </article>
    </div>
    <p className="history-footnote">Written from fixed sentence patterns filled in with this timeline's facts, so the same seed,
      rules and dials always give the same story. Chapters cover forty years each, from the first term in 1789 to the one that
      begins in 2065.</p>
  </section>;
}
