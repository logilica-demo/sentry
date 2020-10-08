import PropTypes from 'prop-types';
import React from 'react';
import classNames from 'classnames';
import scrollToElement from 'scroll-to-element';
import styled from '@emotion/styled';

import Button from 'app/components/button';
import {defined, objectIsEmpty} from 'app/utils';
import {t} from 'app/locale';
import TogglableAddress, {
  AddressToggleIcon,
} from 'app/components/events/interfaces/togglableAddress';
import PackageLink from 'app/components/events/interfaces/packageLink';
import PackageStatus, {
  PackageStatusIcon,
} from 'app/components/events/interfaces/packageStatus';
import StrictClick from 'app/components/strictClick';
import space from 'app/styles/space';
import withSentryAppComponents from 'app/utils/withSentryAppComponents';
import {DebugMetaActions} from 'app/stores/debugMetaStore';
import {SymbolicatorStatus} from 'app/components/events/interfaces/types';
import {combineStatus} from 'app/components/events/interfaces/debugMeta/utils';
import {IconRefresh, IconChevron} from 'app/icons';
import overflowEllipsis from 'app/styles/overflowEllipsis';
import {Frame, SentryAppComponent, PlatformType} from 'app/types';
import DebugImage from 'app/components/events/interfaces/debugMeta/debugImage';
import {ListItem} from 'app/components/list';

import Context from './context';
import DefaultTitle from './defaultTitle';
import {getPlatform} from './utils';
import Symbol, {FunctionNameToggleIcon} from './symbol';

type Props = {
  data: Frame;
  nextFrame: Frame;
  prevFrame: Frame;
  platform: PlatformType;
  emptySourceNotation: boolean;
  isOnlyFrame: boolean;
  timesRepeated: number;
  registers: Record<string, string>;
  components: Array<SentryAppComponent>;
  showingAbsoluteAddress: boolean;
  onAddressToggle: (event: React.MouseEvent<SVGElement>) => void;
  onFunctionNameToggle: (
    frameID: string
  ) => (event: React.MouseEvent<SVGElement>) => void;
  showCompleteFunctionName: boolean;
  image: React.ComponentProps<typeof DebugImage>['image'];
  maxLengthOfRelativeAddress: number;
  isExpanded?: boolean;
  frameID?: number;
};

type State = {
  isExpanded?: boolean;
};

export class Line extends React.Component<Props, State> {
  static propTypes: any = {
    data: PropTypes.object.isRequired,
    nextFrame: PropTypes.object,
    prevFrame: PropTypes.object,
    platform: PropTypes.string,
    isExpanded: PropTypes.bool,
    emptySourceNotation: PropTypes.bool,
    isOnlyFrame: PropTypes.bool,
    timesRepeated: PropTypes.number,
    registers: PropTypes.objectOf(PropTypes.string.isRequired),
    components: PropTypes.array.isRequired,
    showingAbsoluteAddress: PropTypes.bool,
    showCompleteFunctionName: PropTypes.bool,
    onAddressToggle: PropTypes.func,
    onFunctionNameToggle: PropTypes.func,
    image: PropTypes.object,
    maxLengthOfRelativeAddress: PropTypes.number,
    frameID: PropTypes.number,
  };

  static defaultProps = {
    isExpanded: false,
    emptySourceNotation: false,
  };

  // isExpanded can be initialized to true via parent component;
  // data synchronization is not important
  // https://facebook.github.io/react/tips/props-in-getInitialState-as-anti-pattern.html
  state = {
    isExpanded: this.props.isExpanded,
  };

  toggleContext = evt => {
    evt && evt.preventDefault();

    this.setState({
      isExpanded: !this.state.isExpanded,
    });
  };

  hasContextSource() {
    return defined(this.props.data.context) && !!this.props.data.context.length;
  }

  hasContextVars() {
    return !objectIsEmpty(this.props.data.vars || {});
  }

  hasContextRegisters() {
    return !objectIsEmpty(this.props.registers);
  }

  hasAssembly() {
    return this.getPlatform() === 'csharp' && defined(this.props.data.package);
  }

  isExpandable() {
    return (
      (!this.props.isOnlyFrame && this.props.emptySourceNotation) ||
      this.hasContextSource() ||
      this.hasContextVars() ||
      this.hasContextRegisters() ||
      this.hasAssembly()
    );
  }

  getPlatform() {
    // prioritize the frame platform but fall back to the platform
    // of the stacktrace / exception
    return getPlatform(this.props.data.platform, this.props.platform);
  }

  isInlineFrame() {
    return (
      this.props.prevFrame &&
      this.getPlatform() === (this.props.prevFrame.platform || this.props.platform) &&
      this.props.data.instructionAddr === this.props.prevFrame.instructionAddr
    );
  }

  shouldShowLinkToImage() {
    const {symbolicatorStatus} = this.props.data;

    return (
      !!symbolicatorStatus && symbolicatorStatus !== SymbolicatorStatus.UNKNOWN_IMAGE
    );
  }

  packageStatus() {
    // this is the status of image that belongs to this frame
    const {image} = this.props;
    if (!image) {
      return 'empty';
    }

    const combinedStatus = combineStatus(image.debug_status, image.unwind_status);

    switch (combinedStatus) {
      case 'unused':
        return 'empty';
      case 'found':
        return 'success';
      default:
        return 'error';
    }
  }

  scrollToImage = event => {
    event.stopPropagation(); // to prevent collapsing if collapsable
    DebugMetaActions.updateFilter(this.props.data.instructionAddr);
    scrollToElement('#packages');
  };

  preventCollapse = evt => {
    evt.stopPropagation();
  };

  renderExpander() {
    if (!this.isExpandable()) {
      return null;
    }

    const {isExpanded} = this.state;

    return (
      <ToogleContextButton title={t('Toggle Context')} onClick={this.toggleContext}>
        <StyledIconChevron
          isExpanded={!!isExpanded}
          direction={isExpanded ? 'up' : 'down'}
          size="8px"
        />
      </ToogleContextButton>
    );
  }

  leadsToApp() {
    return !this.props.data.inApp && this.props.nextFrame && this.props.nextFrame.inApp;
  }

  isFoundByStackScanning() {
    const {data} = this.props;

    return data.trust === 'scan' || data.trust === 'cfi-scan';
  }

  renderLeadHint() {
    if (this.leadsToApp() && !this.state.isExpanded) {
      return <LeadHint className="leads-to-app-hint">{t('Called from: ')}</LeadHint>;
    }

    return null;
  }

  renderRepeats() {
    const timesRepeated = this.props.timesRepeated;
    if (timesRepeated > 0) {
      return (
        <RepeatedFrames
          title={`Frame repeated ${timesRepeated} time${timesRepeated === 1 ? '' : 's'}`}
        >
          <RepeatedContent>
            <StyledIconRefresh />
            <span>{timesRepeated}</span>
          </RepeatedContent>
        </RepeatedFrames>
      );
    }

    return null;
  }

  renderDefaultLine() {
    return (
      <StrictClick onClick={this.isExpandable() ? this.toggleContext : undefined}>
        <DefaultLine className="title">
          <VertCenterWrapper>
            <div>
              {this.renderLeadHint()}
              <DefaultTitle frame={this.props.data} platform={this.props.platform} />
            </div>
            {this.renderRepeats()}
          </VertCenterWrapper>
          {this.renderExpander()}
        </DefaultLine>
      </StrictClick>
    );
  }

  renderNativeLine() {
    const {
      data,
      showingAbsoluteAddress,
      onAddressToggle,
      onFunctionNameToggle,
      image,
      maxLengthOfRelativeAddress,
      showCompleteFunctionName,
      frameID,
    } = this.props;

    const leadHint = this.renderLeadHint();
    const packageStatus = this.packageStatus();

    return (
      <StrictClick onClick={this.isExpandable() ? this.toggleContext : undefined}>
        <DefaultLine className="title as-table">
          <NativeLineContent>
            <PackageInfo>
              {leadHint}
              <PackageLink
                withLeadHint={leadHint !== null}
                packagePath={data.package}
                onClick={this.scrollToImage}
                isClickable={this.shouldShowLinkToImage()}
              >
                <PackageStatus status={packageStatus} tooltip={t('Image loaded')} />
              </PackageLink>
            </PackageInfo>
            {data.instructionAddr && (
              <TogglableAddress
                address={data.instructionAddr}
                startingAddress={image ? image.image_addr : null}
                isAbsolute={showingAbsoluteAddress}
                isFoundByStackScanning={this.isFoundByStackScanning()}
                isInlineFrame={this.isInlineFrame()}
                onToggle={onAddressToggle}
                relativeAddressMaxlength={maxLengthOfRelativeAddress}
              />
            )}
            <Symbol
              frame={data}
              frameID={frameID}
              showCompleteFunctionName={showCompleteFunctionName}
              onFunctionNameToggle={onFunctionNameToggle}
            />
          </NativeLineContent>
          {this.renderExpander()}
        </DefaultLine>
      </StrictClick>
    );
  }

  renderLine() {
    switch (this.getPlatform()) {
      case 'objc':
      // fallthrough
      case 'cocoa':
      // fallthrough
      case 'native':
        return this.renderNativeLine();
      default:
        return this.renderDefaultLine();
    }
  }

  render() {
    const data = this.props.data;

    const className = classNames({
      frame: true,
      'is-expandable': this.isExpandable(),
      expanded: this.state.isExpanded,
      collapsed: !this.state.isExpanded,
      'system-frame': !data.inApp,
      'frame-errors': data.errors,
      'leads-to-app': this.leadsToApp(),
      [this.getPlatform()]: true,
    });
    const props = {className};

    return (
      <StyledListItem {...props}>
        {this.renderLine()}
        <Context
          frame={data}
          registers={this.props.registers}
          components={this.props.components}
          hasContextSource={this.hasContextSource()}
          hasContextVars={this.hasContextVars()}
          hasContextRegisters={this.hasContextRegisters()}
          emptySourceNotation={this.props.emptySourceNotation}
          hasAssembly={this.hasAssembly()}
          expandable={this.isExpandable()}
          isExpanded={this.state.isExpanded}
        />
      </StyledListItem>
    );
  }
}
export default withSentryAppComponents(Line, {componentType: 'stacktrace-link'});

const RepeatedFrames = styled('div')`
  display: inline-block;
  border-radius: 50px;
  padding: 1px 3px;
  margin-left: ${space(1)};
  border-width: thin;
  border-style: solid;
  border-color: ${p => p.theme.orange500};
  color: ${p => p.theme.orange500};
  background-color: ${p => p.theme.gray100};
  white-space: nowrap;
`;

const VertCenterWrapper = styled('div')`
  display: flex;
  align-items: center;
`;

const RepeatedContent = styled(VertCenterWrapper)`
  justify-content: center;
`;

const PackageInfo = styled('div')`
  display: grid;
  grid-template-columns: auto 1fr;
  order: 2;
  align-items: flex-start;
  @media (min-width: ${props => props.theme.breakpoints[0]}) {
    order: 0;
  }
`;

const NativeLineContent = styled('div')`
  display: grid;
  flex: 1;
  grid-gap: ${space(0.5)};
  grid-template-columns: 117px 1fr;
  align-items: flex-start;
  justify-content: flex-start;

  @media (min-width: ${props => props.theme.breakpoints[0]}) {
    grid-template-columns: 150px 117px 1fr auto;
  }

  @media (min-width: ${props => props.theme.breakpoints[2]}) and (max-width: ${props =>
      props.theme.breakpoints[3]}) {
    grid-template-columns: 130px 117px 1fr auto;
  }
`;

const DefaultLine = styled('div')`
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
`;

const StyledIconRefresh = styled(IconRefresh)`
  margin-right: ${space(0.25)};
`;

const LeadHint = styled('div')`
  ${overflowEllipsis}
  width: 67px;
`;

const StyledIconChevron = styled(IconChevron, {
  shouldForwardProp: prop => prop !== 'isExpanded',
})<{isExpanded: boolean}>`
  transform: rotate(${p => (p.isExpanded ? '180deg' : '0deg')});
  transition: 0.1s all;
`;

// the Buton's label has the padding of 3px because the button size has to be 16x16 px.
const ToogleContextButton = styled(Button)`
  span:first-child {
    padding: 3px;
  }
`;

const StyledListItem = styled(ListItem)`
  padding-left: 0;
  flex-direction: column;
  align-items: flex-start;
  ${PackageStatusIcon} {
    flex-shrink: 0;
  }
  :hover {
    ${PackageStatusIcon} {
      visibility: visible;
    }
    ${AddressToggleIcon} {
      visibility: visible;
    }
    ${FunctionNameToggleIcon} {
      visibility: visible;
    }
  }
  ul &:before {
    content: none;
  }
  > * {
    flex: 1;
    width: 100%;
  }
`;
