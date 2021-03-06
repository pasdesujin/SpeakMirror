// https://github.com/cezary/react-webcam
import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { findDOMNode } from 'react-dom';

import MediaStreamRecorder from 'msr';
import resampler from 'audio-resampler';
import toWav from 'audiobuffer-to-wav';


function hasGetUserMedia() {
  return !!(navigator.getUserMedia || navigator.webkitGetUserMedia ||
            navigator.mozGetUserMedia || navigator.msGetUserMedia);
}

class Webcam extends Component {
  static defaultProps = {
    audio: true,
    height: 480,
    width: 640,
    screenshotFormat: 'image/jpeg',
    onUserMedia: () => {}
  };

  static propTypes = {
    audio: PropTypes.bool,
    muted: PropTypes.bool,
    onUserMedia: PropTypes.func,
    height: PropTypes.oneOfType([
      PropTypes.number,
      PropTypes.string
    ]),
    width: PropTypes.oneOfType([
      PropTypes.number,
      PropTypes.string
    ]),
    screenshotFormat: PropTypes.oneOf([
      'image/webp',
      'image/png',
      'image/jpeg'
    ]),
    className: PropTypes.string
  };

  static mountedInstances = [];

  static userMediaRequested = false;

  constructor(props) {
    super(props);
    this.state = {
      hasUserMedia: false,
      recording: false,
      recordedBlobs: [],
      id: undefined,
      recorder: undefined
    };
  }

  componentDidMount() {
    if (!hasGetUserMedia()) return;

    Webcam.mountedInstances.push(this);

    if (!this.state.hasUserMedia && !Webcam.userMediaRequested) {
      this.requestUserMedia();
    }

  }

  requestUserMedia() {
    navigator.getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia || navigator.msGetUserMedia);

    const sourceSelected = (videoSource) => {
      const constraints = {
        video: {
          optional: [{sourceId: videoSource}]
        },
        audio: false
      };

      navigator.getUserMedia(constraints, (stream) => {
        Webcam.mountedInstances.forEach((instance) => {
          return instance.handleUserMedia(null, stream);
        });
      }, (e) => {
        Webcam.mountedInstances.forEach((instance) => instance.handleUserMedia(e));
      });
    };

    if (this.props.videoSource) {
      sourceSelected(this.props.videoSource);
    } else {
      sourceSelected();
    }

    Webcam.userMediaRequested = true;
  }

  handleUserMedia(error, stream) {
    if (error) {
      this.setState({
        hasUserMedia: false
      });

      return;
    }

    navigator.getUserMedia({audio: true}, (audioStream) => {
      this.audioStream = audioStream;
    }, (e) => {});

    let src = window.URL.createObjectURL(stream);
    this.stream = stream;
    this.setState({
      hasUserMedia: true,
      src
    });

    this.props.onUserMedia();
  }

  componentWillUnmount() {
    let index = Webcam.mountedInstances.indexOf(this);
    Webcam.mountedInstances.splice(index, 1);

    if (Webcam.mountedInstances.length === 0 && this.state.hasUserMedia) {
      if (this.stream.stop) {
        this.stream.stop();
      } else {
        if (this.stream.getVideoTracks) {
          for (let track of this.stream.getVideoTracks()) {
            track.stop();
          }
        }
        if (this.stream.getAudioTracks) {
          for (let track of this.stream.getAudioTracks()) {
            track.stop();
          }
        }
      }
      Webcam.userMediaRequested = false;
      window.URL.revokeObjectURL(this.state.src);
    }
  }

  // method that handle recording when user click the start button
  handleRecording() {
    if (!this.state.recording) {
      let mediaRecorder = new MediaStreamRecorder(this.audioStream);
      this.setState({
        id: Date.now(),
        recorder: mediaRecorder
      }, () => {
        mediaRecorder.mimeType = 'audio/wav';
        mediaRecorder.audioChannels = 1;
        mediaRecorder.ondataavailable = (e) => {
          // resample to 8kHz before sending to server
          let u = URL.createObjectURL(e);
          resampler(u, 8000, (event) => {
            let wav = toWav(event.getAudioBuffer());
            let wavFile = new Blob([wav]);
            this.props.sttSocket.emit('audio', {
              id:this.state.id,
              data: wavFile,
              isFinal: false,
              sessionTimestamp: this.props.sessionTimestamp
            });
            URL.revokeObjectURL(u);
          });
        };
        mediaRecorder.start(3000);
        this.setState({recording:!this.state.recording}, () => {
          this.callScreenshot(mediaRecorder);
        });
      });
    } else {
      this.setState({recording:!this.state.recording}, () => {
        this.state.recorder.stop();
        this.props.sttSocket.emit('audio', {
          id:this.state.id,
          data: '',
          isFinal: true,
          sessionTimestamp:this.props.sessionTimestamp,
          user: this.props.user.username
        });
      });
    }
  }

  callScreenshot(mediaRecorder) {
    if (this.state.recording) {
      this.props.socket.emit('file', {
        dataTimestamp: Date.now(),
        data: this.getScreenshot(),
        sessionTimestamp: this.props.sessionTimestamp,
        user: this.props.user.username
      });
      setTimeout(() => {
        this.callScreenshot(mediaRecorder);
      }, 3000);
    }
  }

  getScreenshot() {
    if (!this.state.hasUserMedia) return null;

    let canvas = this.getCanvas();
    return canvas.toDataURL(this.props.screenshotFormat);
  }

  getCanvas() {
    if (!this.state.hasUserMedia) return null;

    const video = findDOMNode(this);
    const actualVideo = video.getElementsByTagName('video')[0];
    if (!this.ctx) {
      let canvas = document.createElement('canvas');
      const aspectRatio = actualVideo.videoWidth / actualVideo.videoHeight;
      canvas.width = actualVideo.clientWidth;
      canvas.height = actualVideo.clientWidth / aspectRatio;

      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
    }
    const {ctx, canvas} = this;
    ctx.drawImage(actualVideo, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  render() {
    const text = this.state.recording ? 'Stop' : 'Start';
    return (
      <div className="col-md-8">
        <div className="row">
          <video
            autoPlay
            width={this.props.width}
            height={this.props.height}
            src={this.state.src}
            muted={this.props.muted}
            className={this.props.className}
          />
        </div>
        <div className="row">
          <button
            onClick={this.handleRecording.bind(this)}
            className="btn btn-default">{text}
            {this.state.recording ? <span className="glyphicon glyphicon-stop"></span> : <span className="glyphicon glyphicon-play"></span>}
          </button>
        </div>
      </div>
    );
  }
}

function mapStateToProps(state) {
  return {
    socket: state.socket
  };
}

export default connect(mapStateToProps)(Webcam);
