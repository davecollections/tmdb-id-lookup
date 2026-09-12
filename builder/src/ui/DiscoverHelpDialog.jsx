import { NestedPreviewDialog } from "./NestedPreviewDialog.jsx";

export function DiscoverHelpDialog({ editing, scope = "new-collection", onClose }) {
 const adding = scope === "add-source", folder = scope === "new-folder";
 return <NestedPreviewDialog ariaLabelledBy="discover-help-title" onClose={onClose}
  backdropClassName="discover-help-backdrop" backdropProps={{ onMouseDown: (e) => { if (e.target === e.currentTarget) e.preventDefault(); } }}
  dialogClassName="add-source-dialog discover-dialog discover-help-dialog">
  <header><h3 id="discover-help-title">How to use Discover</h3><button type="button" className="editor-apply genre-secondary-done" onClick={onClose}>Done</button></header>
  <div className="discover-help-scroll genre-help-subview" tabIndex={0} aria-label="Discover guide">
   <section className="discover-help-quick-start" aria-labelledby="discover-quick-start-title">
    <h4 id="discover-quick-start-title">Quick start</h4>
    <p>{editing ? "Refine this source’s movie or series results around the things you enjoy." : adding ? "Add results for movies, series or both to this folder, based on the things you enjoy." : `Build a ${folder ? "folder" : "collection"} of movies, series or both around the things you enjoy.`}</p>
    <ol>
     <li>{editing ? <>Your source’s <strong>Media</strong> stays fixed as Movies or Series.</> : <>Choose <strong>Movies</strong>, <strong>Series</strong> or <strong>Both</strong>.</>}</li>
     <li>{editing ? <>Keep the current order, or choose another under <strong>Sort titles by</strong>.</> : <>Leave <strong>Popular</strong> selected to start, or choose another option under <strong>Sources to create</strong>.</>}</li>
     <li>{editing ? "Adjust" : "Add"} the filters you want, such as a keyword or genre.</li>
     <li>Use <strong>Preview titles</strong> to check the results, then {editing ? <>choose <strong>Continue to Review</strong> and <strong>Save source</strong>.</> : adding ? <>choose <strong>Continue to Review</strong> and <strong>Add sources</strong>.</> : `continue to finish your ${folder ? "folder" : "collection"}.`}</li>
    </ol>
    <p>You can start with just one or two filters.</p>
   </section>
   <section aria-labelledby="discover-help-controls-title">
    <h4 id="discover-help-controls-title">Using the controls</h4>
    <dl>
     <div><dt>Keywords</dt><dd>Search for a keyword, then select a suggestion. Typing alone does not apply it. Check Preview titles to see whether it fits what you had in mind.</dd></div>
     <div><dt>Include and Exclude</dt><dd><strong>Include</strong> is for things you want in the results. <strong>Exclude</strong> is for things to leave out.</dd></div>
     <div><dt>Match any (OR)</dt><dd>At least one included choice must match.</dd></div>
     <div><dt>Match all (AND)</dt><dd>Every included choice must match.</dd></div>
     <div><dt>Matching rules</dt><dd>The rule applies to all included choices in that section, including choices already selected. Exclusions are separate: a title matching any excluded choice is left out.</dd></div>
     <div><dt>Combining filters</dt><dd>Different sections work together. For example, the time travel keyword, Minimum rating 7 and From date 1 January 2010 must all be satisfied.</dd></div>
     <div><dt>{editing ? "Sort titles by" : "Sources to create"}</dt><dd>A source is one set of results inside a folder. {editing ? "Choose how this source’s titles are ordered; its media stays fixed." : "Popular and Recent create two separate sources using the same filters. Both creates separate Movie and Series sources for each selected option."}</dd></div>
     <div><dt>Preview titles</dt><dd>Shows a sample of matching titles. When shown, the title count is TMDB’s total for the filters and media currently being previewed, not the number of posters displayed. If results are too narrow, remove one filter and preview again.</dd></div>
    </dl>
   </section>
   <details className="genre-advanced-options discover-help-disclosure">
    <summary>Examples</summary>
    {editing ? <p>Use the example for your source’s fixed media.</p> : null}
    <section><h4>Buddy cop movies</h4>
     <p>Find well-rated English-language buddy cop movies from 2020 onwards, without horror.</p>
     <ol>
      <li>{editing ? "For a Movies source," : "Choose Movies;"} under <strong>Keywords</strong>, use <strong>Include</strong> and select the <strong>buddy cop</strong> search suggestion.</li>
      <li>Under <strong>Genres</strong>, use <strong>Exclude</strong> and select <strong>Horror</strong>.</li>
      <li>Set <strong>From date</strong> to <strong>1 January 2020</strong>; leave Through date and Release year blank.</li>
      <li>Set <strong>Minimum rating</strong> to <strong>7</strong>, <strong>Minimum votes</strong> to <strong>100</strong> and <strong>Original language</strong> to <strong>English</strong>, then use <strong>Preview titles</strong>.</li>
     </ol>
    </section>
    <section><h4>Time-travel series</h4>
     <p>Find series about time travel that first aired in 2010 or later.</p>
     <ol>
      <li>{editing ? "For a Series source," : "Choose Series;"} under <strong>Keywords</strong>, use <strong>Include</strong> and select the <strong>time travel</strong> search suggestion.</li>
      <li>Set <strong>From date</strong> to <strong>1 January 2010</strong>; leave Through date and Release year blank, then use <strong>Preview titles</strong>.</li>
     </ol>
    </section>
    <section><h4>Animated family movies from the 1990s</h4>
     <p>Find movies from 1990 to 1999 that are both animated and made for families.</p>
     <ol>
      <li>{editing ? "For a Movies source," : "Choose Movies;"} under <strong>Genres</strong>, use <strong>Include</strong> and select <strong>Animation</strong> and <strong>Family</strong>.</li>
      <li>Choose <strong>Match all (AND)</strong>.</li>
      <li>Set <strong>From date</strong> to <strong>1 January 1990</strong> and <strong>Through date</strong> to <strong>31 December 1999</strong>; leave Release year blank, then use <strong>Preview titles</strong>.</li>
     </ol>
    </section>
   </details>
   <details className="genre-advanced-options discover-help-disclosure">
    <summary>Advanced tips</summary>
    <dl>
     {!editing ? <div><dt>Both</dt><dd>Each Movie or Series source uses the genres and exclusions that apply to it. If no included genres apply to one side, that side has no included genre restriction. Networks affect Series only. Check the actual per-media filters in Review.</dd></div> : null}
     <div><dt>Providers, Studios and Networks</dt><dd>Providers filter availability in your selected Watch region, including rent and buy. They do not filter who made a title. Studios filter production companies; Networks filter TV networks and apply only to Series.</dd></div>
     <div><dt>Browsing choices</dt><dd>Studios, Networks and Providers show more choices as you scroll. More results is also available by keyboard. Inside the picker, View selected shows your choices for the current Include or Exclude mode, where available. Select a choice to remove it; Back to browsing restores your search and position.</dd></div>
     <div><dt>Changing Include or Exclude</dt><dd>For Genres, switch mode and tap the genre. For Keywords, Studios and Providers, remove the choice before selecting it in the opposite mode. Similar keyword names can be separate choices.</dd></div>
     <div><dt>Preview display choices</dt><dd>Preview’s Show and media choices change only what you preview, not your saved settings.</dd></div>
     <div><dt>Different combinations</dt><dd>Each section has one Match any or Match all rule. For Action plus Adventure, or Animation plus Comedy, use two separate Discover sources with Match all for each pair and the same other filters. They remain separate sources; mixed rules within one section are not supported.</dd></div>
     <div><dt>Date ranges</dt><dd>From date and Through date use movie release dates or a series’ first-air date. Release year restricts results to one year; leave it blank when you want a range or a date onwards.</dd></div>
    </dl>
   </details>
  </div>
 </NestedPreviewDialog>;
}
