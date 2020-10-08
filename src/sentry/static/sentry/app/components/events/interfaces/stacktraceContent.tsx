import PropTypes from 'prop-types';
import React from 'react';
import styled from '@emotion/styled';
import PlatformIcon from 'platformicons';
import scrollToElement from 'scroll-to-element';

import Line from 'app/components/events/interfaces/frame/line';
import {t} from 'app/locale';
import SentryTypes from 'app/sentryTypes';
import {parseAddress, getImageRange} from 'app/components/events/interfaces/utils';
import {Stacktrace} from 'app/types/stacktrace';
import {PlatformType, Event} from 'app/types';
import {List, ListItem} from 'app/components/list';

type Props = {
  data: Stacktrace;
  includeSystemFrames: boolean;
  platform: PlatformType;
  event: Event;
  expandFirstFrame?: boolean;
  newestFirst?: boolean;
  className?: string;
};

type State = {
  showingAbsoluteAddresses: boolean;
  showCompleteFunctionName: boolean;
};

export default class StacktraceContent extends React.Component<Props, State> {
  static propTypes: any = {
    data: PropTypes.object.isRequired,
    includeSystemFrames: PropTypes.bool,
    expandFirstFrame: PropTypes.bool,
    platform: PropTypes.string,
    newestFirst: PropTypes.bool,
    event: SentryTypes.Event.isRequired,
  };

  static defaultProps = {
    includeSystemFrames: true,
    expandFirstFrame: true,
  };

  state = {
    showingAbsoluteAddresses: false,
    showCompleteFunctionName: false,
  };

  renderOmittedFrames = (firstFrameOmitted, lastFrameOmitted) => {
    const props = {
      className: 'frame frames-omitted',
      key: 'omitted',
    };
    const text = t(
      'Frames %d until %d were omitted and not available.',
      firstFrameOmitted,
      lastFrameOmitted
    );
    return <StyledListItem {...props}>{text}</StyledListItem>;
  };

  frameIsVisible = (frame, nextFrame) =>
    this.props.includeSystemFrames || frame.inApp || (nextFrame && nextFrame.inApp);

  findImageForAddress(address) {
    const images = this.props.event.entries.find(entry => entry.type === 'debugmeta')
      ?.data?.images;

    return images
      ? images.find(img => {
          const [startAddress, endAddress] = getImageRange(img);
          return address >= startAddress && address < endAddress;
        })
      : null;
  }

  handleToggleAddresses = (event: React.MouseEvent<SVGElement>) => {
    event.stopPropagation(); // to prevent collapsing if collapsable

    this.setState(prevState => ({
      showingAbsoluteAddresses: !prevState.showingAbsoluteAddresses,
    }));
  };

  handleToggleFunctionName = (frameID: string) => (
    event: React.MouseEvent<SVGElement>
  ) => {
    event.stopPropagation(); // to prevent collapsing if collapsable

    this.setState(
      prevState => ({
        showCompleteFunctionName: !prevState.showCompleteFunctionName,
      }),
      () => scrollToElement(`#${frameID}`, {align: 'top', offset: -17, duration: -1})
    );
  };

  render() {
    const data = this.props.data;
    const {showingAbsoluteAddresses, showCompleteFunctionName} = this.state;
    let firstFrameOmitted, lastFrameOmitted;

    if (data.framesOmitted) {
      firstFrameOmitted = data.framesOmitted[0];
      lastFrameOmitted = data.framesOmitted[1];
    } else {
      firstFrameOmitted = null;
      lastFrameOmitted = null;
    }

    let lastFrameIdx: number | null = null;
    data.frames.forEach((frame, frameIdx) => {
      if (frame.inApp) {
        lastFrameIdx = frameIdx;
      }
    });
    if (lastFrameIdx === null) {
      lastFrameIdx = data.frames.length - 1;
    }

    const expandFirstFrame = this.props.expandFirstFrame;
    const frames: React.ReactElement[] = [];
    let nRepeats = 0;

    const maxLengthOfAllRelativeAddresses = data.frames.reduce(
      (maxLengthUntilThisPoint, frame) => {
        const correspondingImage = this.findImageForAddress(frame.instructionAddr);

        try {
          const relativeAddress = (
            parseAddress(frame.instructionAddr) -
            parseAddress(correspondingImage.image_addr)
          ).toString(16);

          return maxLengthUntilThisPoint > relativeAddress.length
            ? maxLengthUntilThisPoint
            : relativeAddress.length;
        } catch {
          return maxLengthUntilThisPoint;
        }
      },
      0
    );

    data.frames.forEach((frame, frameIdx) => {
      const prevFrame = data.frames[frameIdx - 1];
      const nextFrame = data.frames[frameIdx + 1];
      const repeatedFrame =
        nextFrame &&
        frame.lineNo === nextFrame.lineNo &&
        frame.instructionAddr === nextFrame.instructionAddr &&
        frame.package === nextFrame.package &&
        frame.module === nextFrame.module &&
        frame.function === nextFrame.function;

      if (repeatedFrame) {
        nRepeats++;
      }

      if (this.frameIsVisible(frame, nextFrame) && !repeatedFrame) {
        const image = this.findImageForAddress(frame.instructionAddr);

        frames.push(
          <Line
            key={frameIdx}
            frameID={frameIdx + 1}
            data={frame}
            isExpanded={expandFirstFrame && lastFrameIdx === frameIdx}
            emptySourceNotation={lastFrameIdx === frameIdx && frameIdx === 0}
            isOnlyFrame={this.props.data.frames.length === 1}
            nextFrame={nextFrame}
            prevFrame={prevFrame}
            platform={this.props.platform}
            timesRepeated={nRepeats}
            showingAbsoluteAddress={showingAbsoluteAddresses}
            onAddressToggle={this.handleToggleAddresses}
            image={image}
            maxLengthOfRelativeAddress={maxLengthOfAllRelativeAddresses}
            registers={{}} //TODO: Fix registers
            onFunctionNameToggle={this.handleToggleFunctionName}
            showCompleteFunctionName={showCompleteFunctionName}
          />
        );
      }

      if (!repeatedFrame) {
        nRepeats = 0;
      }

      if (frameIdx === firstFrameOmitted) {
        frames.push(this.renderOmittedFrames(firstFrameOmitted, lastFrameOmitted));
      }
    });

    if (frames.length > 0 && data.registers) {
      const lastFrame = frames.length - 1;
      frames[lastFrame] = React.cloneElement(frames[lastFrame], {
        registers: data.registers,
      });
    }

    if (this.props.newestFirst) {
      frames.reverse();
    }

    let className = this.props.className || '';
    className += ' traceback';

    if (this.props.includeSystemFrames) {
      className += ' full-traceback';
    } else {
      className += ' in-app-traceback';
    }

    const {platform} = this.props;

    return (
      <Wrapper className={className}>
        <StyledPlatformIcon
          platform={platform || 'other'}
          size="20px"
          style={{borderRadius: '3px 0 0 3px'}}
        />
        <StyledList platform={platform}>{frames}</StyledList>
      </Wrapper>
    );
  }
}

const Wrapper = styled('div')`
  position: relative;
  border-top-left-radius: 0;
`;

const StyledPlatformIcon = styled(PlatformIcon)`
  position: absolute;
  top: -1px;
  left: -20px;
`;

const StyledList = styled(List)<{platform: PlatformType}>`
  padding-left: 0;
  flex-direction: column;
  align-items: flex-start;
  position: relative;
`;

const StyledListItem = styled(ListItem)`
  padding-left: 0;
  flex-direction: column;
  align-items: flex-start;
  ul &:before {
    content: none;
  }
  > *:first-child {
    flex: 1;
    width: 100%;
  }
`;
