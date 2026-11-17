import React, {Component} from 'react';
import PropTypes from 'prop-types';
import PromptLayout from './PromptLayout';

/**
 * A template set of contents for the CustomAlert class that holds a series of selectable options.
 * It is drawn in PromptLayout's three parts: the label is the title, the header, the children and
 * the footer are the middle, and the button (or renderButton's buttons) is the foot.
 */
class ButtonPrompt extends Component {

    constructor(props) {
        super(props);
        this.state = {
            selection: undefined
        }
    }

    render() {
        return (
            <PromptLayout
                className={this.props.className}
                title={this.props.renderLabel(this)}
                buttons={this.props.renderButton(this)}
            >
                {this.props.renderHeader(this)}
                {this.props.children}
                {this.props.renderFooter(this)}
            </PromptLayout>
        );
    }
}

// noinspection JSUnusedGlobalSymbols
ButtonPrompt.defaultProps = {
    label: "LABEL GOES HERE",
    renderLabel: (obj) => {
        return (<h2 id={"prompt-label"}>{obj.props.label}</h2>);
    },

    headerText: "",
    renderHeader: (obj) => {
        return (
            <p id={"prompt-header"} className={"left-align"}>{obj.props.headerText}</p>
        );
    },

    footerText: "",
    renderFooter: (obj) => {
        return (
            <p id={"prompt-header"} className={"left-align"}>{obj.props.footerText}</p>
        );
    },

    buttonText: "CONFIRM",
    buttonOnClick: () => {console.log("Button clicked.")},
    buttonDisabled: false,
    renderButton: (obj) => {
        return (
            <button id={"prompt-button"} disabled={obj.props.buttonDisabled} onClick={obj.props.buttonOnClick}>
                {obj.props.buttonText}
            </button>
        );
    },

};

ButtonPrompt.propTypes = {
    className: PropTypes.string,
    label: PropTypes.string,
    renderLabel: PropTypes.func,
    headerText: PropTypes.string,
    renderHeader: PropTypes.func,

    onOptionSelected: PropTypes.func,
    renderOptions: PropTypes.func,

    footerText: PropTypes.string,
    renderFooter: PropTypes.func,

    buttonText: PropTypes.string,
    buttonOnClick: PropTypes.func,
    buttonDisabled: PropTypes.bool,
    renderButton: PropTypes.func
};


export default ButtonPrompt;