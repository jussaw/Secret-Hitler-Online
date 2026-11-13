import React, {Component} from 'react';
import "./EventBar.css";

class EventBar extends Component {

    constructor(props) {
        super(props);
        this.state = {
            inStartingState: true
        };
    }

    /**
     * Clears {@code inStartingState} the first time the bar is shown. Until then the bar keeps
     * "start-eventbar" (hidden, no animation), so a bar that mounts hidden does not play the fade-out.
     */
    static getDerivedStateFromProps(props, state) {
        return {inStartingState: state.inStartingState && !props.show};
    }

    getClass() {
        if (this.state.inStartingState) {
            return "start-eventbar";
        } else if (this.props.show) {
            return "appear-eventbar";
        } else {
            return "disappear-eventbar";
        }
    }

    render() {
        return (
            <div id="event-bar" className={this.getClass()}>
                <div id="bar-background" className={this.getClass()} />
                <h1 id="event-bar-text" className={this.getClass()}>{this.props.message}</h1>
            </div>
        );
    }
}

EventBar.defaultProps = {
    message: "CHANCELLOR NOMINATION",
    show: true
};

export default EventBar;