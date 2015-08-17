var _takeWhile = require('lodash.takewhile');
var _isFinite = require('lodash.isFinite');
var _last = require('lodash.last');
var bs = require('./utils/binary_index_search');
var ViewState = require('./ViewState');


// In this impl, we always have at least the first measurements
// because we used the forwards computer for the first render. (hack)
function computeViewStateFlipped (apertureHeight, measuredDistances, scrollTop, prevMeasuredScrollableHeight, numChildren, maxChildrenPerScreen) {

    console.assert(_isFinite(prevMeasuredScrollableHeight));
    // in fact the previous measuredScrollableHeight is the one we want.
    // Since our scrollTop is relative to the last render's measuredScrollableHeight.


    // The top is visibleStartHeight. That's they key to computing the forwards mode results.
    // It's just free - scrollTop - in forwards mode. It's not free in backwards mode.
    // But once we have it, we can reuse the forwards mode results?
    var apertureTop = scrollTop;
    var apertureBottom = scrollTop + apertureHeight;
    var visibleStart_DistanceFromFront = prevMeasuredScrollableHeight - apertureBottom;
    var visibleEnd_DistanceFromFront = prevMeasuredScrollableHeight - apertureTop;

    var visibleStart = _takeWhile(measuredDistances, (d) => { return d < visibleStart_DistanceFromFront; }).length;



    var numItemsMeasured = measuredDistances.length;
    var anyHeightsMeasured = numItemsMeasured > 0;
    var allHeightsMeasured = numChildren === numItemsMeasured;

    /**
     * perfectChildrenHeight and displayablesHeight is not knowable until we measure it after render,
     * as depends on browser layout.
     */
    var perfectChildrenHeight = allHeightsMeasured ? _last(measuredDistances) : undefined;
    var measuredChildrenHeight = anyHeightsMeasured ? _last(measuredDistances) : undefined;


    /**
     * scrollableHeight is the .scrollHeight of the scrollable div which conceptually,
     *   = frontSpacer + displayablesHeight + backSpacer [+ loadSpinner]
     *   ~ perfectChildrenHeight [+ loadSpinner]
     *   ~ measuredChildrenHeight [+ loadSpinner]
     *
     * It has nothing to do with the apertureHeight.
     *
     * If all heights aren't known, we can't know the perfectMeasuredScrollableHeight.
     * Determined by browser layout - we can't ever depend on this. (is this correct???)
     */
    var scrollableHeight = undefined;


    /**
     * If we don't know the exact desired scrollHeight, we can't compute visibleEnd,
     * so estimate it, such that it will always be more items displayed than fit on a screen.
     * A few too many elements in the dom doesn't matter.
     * Do we need a bottom spacer in this case? Yeah, if we've seen more heights that where we
     * are but not all the heights, so the scroll area doesn't grow then shrink.
     */
    var visibleEnd; // not inclusive.. Math range notation: [visibleStart, visibleEnd)
    if (allHeightsMeasured) {
        var foundIndex = bs.binaryIndexSearch(measuredDistances, visibleEnd_DistanceFromFront, bs.opts.CLOSEST_HIGHER);
        var found = typeof foundIndex !== 'undefined';
        visibleEnd = found
            ? foundIndex + 1 // don't understand why we are off by one here.
            : numItemsMeasured;
    }
    else {
        visibleEnd = visibleStart + maxChildrenPerScreen;
    }
    // add ANOTHER maxChildrenPerScreen, which are never visible, so we always have room to scroll
    // down. Doing it this way, rather then adding apertureHeight to the backSpace, ensures that
    // if we scroll all the way down we bump into the bottom and can't scroll past the last child.
    visibleEnd = visibleEnd + maxChildrenPerScreen;

    /**
     * displayablesHeight is not knowable until after render as we measure it from the browser layout.
     * visibleStart=0 means zero distance. This indexing is weird, I'm not sure why.
     *
     * On the first render/frame that adds new, not-yet-measured item, we will have an incorrect
     * displayablesHeight because we can't compute it prefectly until it actually hits the dom.
     * That's okay - just use the previous displayablesHeight. We're probably only off by a few pixels.
     */

    // may be past the end of measuredHeights if we haven't yet measured these now-visible items.
    // Don't want this value undefined if anyHeightsMeasured, because backSpace depends on it.
    // Fallback to prior render's value. BackSpacer is an approximation anyway.
    //console.assert(visibleEnd >= numItemsMeasured);
    var numNewlyVisibleItems = Math.max(0, visibleEnd - numItemsMeasured);
    //console.assert(numNewlyVisibleItems >= 0);
    var visibleEndHeight = measuredDistances[visibleEnd-numNewlyVisibleItems-1];
    var visibleStartHeight = (visibleStart-numNewlyVisibleItems > 0 // why is this case special?
        ? measuredDistances[visibleStart-numNewlyVisibleItems-1]
        : 0);

    var displayablesHeight;
    if (anyHeightsMeasured) {
        displayablesHeight = visibleEndHeight - visibleStartHeight;
    }
    else {
        displayablesHeight = undefined;
    }

    /**
     * The top spacer is exactly the height of the elided items above the displayable segment.
     * If we don' have the measurements yet, we know we're at the beginning so no spacer needed.
     * visibleStart=0 means 0 space.
     */
    var frontSpace;
    if (visibleStart === 0) {
        frontSpace = 0;
    }
    else {
        frontSpace = anyHeightsMeasured ? measuredDistances[visibleStart-1] : 0;
    }


    /**
     * The bottom spacer is the height of elided items below the displayable segment.
     * This height is only knowable if we have seen and measured all the items' height.
     * Exact measurement is only needed as we approach the bottom to prevent over-scrolling.
     * If we don't know any heights, just leave enough downward scroll room for at least
     * one more screenful of results.
     */
    var backSpace;
    if (allHeightsMeasured) {
        var actualVisibleEnd = Math.min(visibleEnd, numItemsMeasured);
        backSpace = perfectChildrenHeight - measuredDistances[actualVisibleEnd-1];
    }
    else if (anyHeightsMeasured) {
        // Don't have all the heights, so we know there is more we haven't seen/measured,
        // and we don't know how much more. Leave an extra screenful of room to scroll down.
        // If we have now-visible items that aren't measured yet, fallback to the last value we have.
        // The measuredChildrenHeight should monotonically increase over time.
        // measuredScrollableHeight should also, except for the loadSpinner.
        backSpace = measuredChildrenHeight - visibleEndHeight;
        // the visibleEndHeight accounts for extra screenful of visible children, which are never onscreen
    }
    else {
        // don't have any height data on first render,
        // leave about a screenful of room to scroll down.
        backSpace = apertureHeight;
    }


    /**
     * scrollableHeight is different than perfectScrollableHeight,
     * which if all heights known, = last(measuredDistances) [+ loadSpiner]
     * These values aren't used, they are just for diagnostics.
     */
    var perfectScrollableHeight = perfectChildrenHeight; // [+ loadspinner]
    var measuredScrollableHeight = frontSpace + displayablesHeight + backSpace /*+loadSpinner*/;
    if (anyHeightsMeasured) {
        console.assert(measuredScrollableHeight >= measuredChildrenHeight);
    }

    // Some sanity checks and documentation of assumptions.
    console.assert(apertureBottom - apertureTop === apertureHeight);
    console.assert(_isFinite(visibleStartHeight) && visibleStartHeight >= 0);
    console.assert(visibleEndHeight === undefined || (_isFinite(visibleEndHeight) && visibleEndHeight >= 0));
    console.assert(_isFinite(frontSpace) && frontSpace >= 0);
    console.assert(_isFinite(backSpace) && backSpace >= 0);
    console.assert(_isFinite(visibleStart) && visibleStart >= 0 && visibleStart <= numChildren);
    console.assert(_isFinite(visibleEnd) && visibleEnd >= 0 /*&& visibleEnd <= numChildren*/);
    console.assert(_isFinite(apertureHeight));
    console.assert(_isFinite(apertureBottom));
    console.assert(_isFinite(perfectChildrenHeight) || perfectChildrenHeight === undefined);
    console.assert(_isFinite(displayablesHeight) || displayablesHeight === undefined);
    console.assert(_isFinite(measuredChildrenHeight) || measuredChildrenHeight === undefined);




    return {
        visibleStart: visibleStart,
        visibleEnd: visibleEnd,
        visibleStartHeight: visibleStartHeight,
        visibleEndHeight: visibleEndHeight,
        frontSpace: frontSpace,
        backSpace: backSpace,

        apertureHeight: apertureHeight,
        apertureBottom: apertureBottom,
        apertureTop: apertureTop,

        numItemsMeasured: numItemsMeasured,
        anyHeightsMeasured: anyHeightsMeasured,
        allHeightsMeasured: allHeightsMeasured,
        perfectChildrenHeight: perfectChildrenHeight,
        measuredChildrenHeight: measuredChildrenHeight,
        displayablesHeight: displayablesHeight,

        //scrollableHeight: scrollableHeight,   -- is this needed?
        perfectScrollableHeight: perfectScrollableHeight,
        measuredScrollableHeight: measuredScrollableHeight,

        numChildren: numChildren,
        maxChildrenPerScreen: maxChildrenPerScreen
        //,measuredDistances: measuredDistances
    };
}

module.exports = {
    computeViewStateFlipped: computeViewStateFlipped
}