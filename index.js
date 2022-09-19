"use strict"

let Service, Characteristic;
const http = require('http');
const axios = require('axios');
const map = new Map();

module.exports = (api) => {
    Service = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    api.registerAccessory('LightbulbGSLabs', LightbulbGSLabs);
    api.registerAccessory('RosetteGSLabs', RosetteGSLabs);
    api.registerAccessory('OpenSensorGSLabs', OpenSensorGSLabs);
    api.registerAccessory('MotionSensorGSLabs', MotionSensorGSLabs);
};

//Добавление в мапу устройств
function addToMap(config, ip) {
    axios({
        method: 'get',
        url: 'http://' + ip + ':60000/v1.3/smarthome/devices',
        headers: {
            Authorization: 'Token aGksbWF4ISBrYWsgZGVsYT8=',
        }
    })
        .then(res => {
            res.data.filter(zcl => {
                if (zcl.dev_name === config.name) {
                    map.set(config.name, zcl.dev_id);
                    console.log('MAP ', map);
                }
            })
        });
}

class LightbulbGSLabs {

    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.ip = config.ip;

        addToMap(this.config, this.ip);


        //Регистрация сервиса (Lightbulb - лампочка)
        this.bulb = new Service.Lightbulb(this.config.name);

        //Настройка обработчика событий для вкл/выкл лампы
        this.bulb.getCharacteristic(Characteristic.On)
            .on("get", this.getPower.bind(this))
            .on("set", this.setPower.bind(this));

        //функция изменения степени свечения
        this.bulb.addCharacteristic(Characteristic.Brightness)
            .on("get", this.getBrightness.bind(this))
            .on("set", this.setBrightness.bind(this));
    }

    getServices() {
        if (!this.bulb) return [];

        const infoService = new Service.AccessoryInformation();
        infoService.setCharacteristic(Characteristic.Manufacturer, 'Nikita Platonov 2022');

        return [infoService, this.bulb];
    }

    getPower(callback) {
        this.log('getPower');
        let isOn = 0;
        let id = map.get(this.config.name);

        axios({
            method: 'get',
            url: 'http://' + this.ip + ':60000/v1.3/smarthome/devices?dev_id=' + id,
            headers: {
                Authorization: 'Token aGksbWF4ISBrYWsgZGVsYT8=',
            }
        })
            .then(res => {
                isOn = res.data[0].zcluster.filter(zcl => {
                    if (zcl.zcl_id === 6) {
                        isOn = zcl.attributes[0].str_attr_value;
                        console.log('----- getPower: Состояние лампочки ', this.config.name, ' - ', isOn);
                        this.bulb.getCharacteristic(Characteristic.On).updateValue(isOn);
                    }
                    if (zcl.zcl_id === 8) {
                        let updBrightness = zcl.attributes[0].str_attr_value;
                        this.bulb.getCharacteristic(Characteristic.Brightness).updateValue(Math.round(updBrightness / 2.54));
                    }
                })
            });

        callback(isOn, 0);
    }

    setPower(on, callback) {
        this.log('----- setPower - CОСТОЯНИЕ ' + on);
        let toSend = '';
        let zcl_id = 6;
        let oppy_key = 0;
        let newBrightness = 26;

        if (on) {
            this.log("----- If ON");
            oppy_key = 1;
        } else {
            this.log("----- If OFF");
            oppy_key = 0;

        }
        if (this.triggeredby == 'color') {
            this.log('----- setPower trigger color');
            zcl_id = 768;
            oppy_key = 10;
            delete this.triggeredby;
        } else if (this.triggeredby == 'slider') {
            this.log('----- setPower trigger slider');
            zcl_id = 8;
            oppy_key = 0;
            newBrightness = Math.round(this.brightness * 2.54);
            this.log('----- newBrightness = ' + newBrightness);
            delete this.triggeredby;
        } else {
            this.log('----- setPower ' + on);
            newBrightness = on ? 254 : 0;
        }

        toSend = '{"zcl_id":' + zcl_id + ','
            + '"oppy_key":' + oppy_key + ','
            + '"params": [' + newBrightness + ', 1],'
            + '"devices":[' + map.get(this.config.name) + '],'
            + '"groups":[]'
            + '}';

        this.log(toSend);

        let options = {
            host: this.ip,
            port: 60000,
            path: '/v1.3/smarthome/opportunity',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Token aGksbWF4ISBrYWsgZGVsYT8='
            }
        }

        let req = http.request(options, res => {
            res.on('data', () => { })
        });

        req.on('error', err => {
            this.log('Error in SetPower:' + err.message);
            callback(err);
        });

        req.end(toSend);
        callback(null);
    }

    getBrightness(callback) {
        this.log('getBrightness ' + this.brightness);
        callback(null, 0);
    }

    setBrightness(brightness, callback) {
        this.brightness = brightness;
        this.triggeredby = 'slider';
        callback(null);
    }
}

class RosetteGSLabs {

    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.ip = config.ip;

        addToMap(this.config, this.ip);

        this.rosette = new Service.Outlet(this.config.name);

        //Настройка обработчика событий для вкл/выкл лампы
        this.rosette.getCharacteristic(Characteristic.On)
            .on("get", this.getPower.bind(this))
            .on("set", this.setPower.bind(this));
    }

    getServices() {
        if (!this.rosette) return [];

        const infoService = new Service.AccessoryInformation();
        infoService.setCharacteristic(Characteristic.Manufacturer, 'Nikita Platonov 2022');

        return [infoService, this.rosette];
    }

    getPower(callback) {
        this.log('getPower');
        let isOn = null;
        let id = map.get(this.config.name);

        axios({
            method: 'get',
            url: 'http://' + this.ip + ':60000/v1.3/smarthome/devices?dev_id=' + id,
            headers: {
                Authorization: 'Token aGksbWF4ISBrYWsgZGVsYT8=',
            }
        })
            .then(res => {
                isOn = res.data[0].zcluster.filter(zcl => {
                    if (zcl.zcl_id === 6) {
                        isOn = zcl.attributes[0].str_attr_value;
                        console.log('----- getPower: Состояние розетки ', this.config.name, ' - ', isOn);
                        this.rosette.getCharacteristic(Characteristic.On).updateValue(isOn);
                    }
                })
            });

        callback(isOn, 0);
    }

    setPower(on, callback) {
        this.log('----- setPower - CОСТОЯНИЕ ' + on);
        let toSend = '';
        let zcl_id = 6;
        let oppy_key = 0;
        if (on) {
            this.log("----- If ON");
            oppy_key = 1;
        } else {
            this.log("----- If OFF");
            oppy_key = 0;

        }

        toSend = '{"zcl_id":' + zcl_id + ','
            + '"oppy_key":' + oppy_key + ','
            + '"params": [],'
            + '"devices":[' + map.get(this.config.name) + '],'
            + '"groups":[]'
            + '}';

        this.log(toSend);

        let options = {
            host: this.ip,
            port: 60000,
            path: '/v1.3/smarthome/opportunity',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Token aGksbWF4ISBrYWsgZGVsYT8='
            }
        }

        let req = http.request(options, res => {
            let recv_data = '';
            res.on('data', chunk => { recv_data += chunk })
        });

        req.on('error', err => {
            this.log('Error in SetPower:' + err.message);
            callback(err);
        });

        req.end(toSend);
        callback(null);
    }
}

class OpenSensorGSLabs {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.ip = config.ip;

        addToMap(this.config, this.ip);

        this.sensor = new Service.MotionSensor(this.config.name);

        this.sensor.getCharacteristic(Characteristic.MotionDetected)
            .on("get", this.handleMotionDetectedGet.bind(this));

    }

    getServices() {
        if (!this.sensor) return [];
        const infoService = new Service.AccessoryInformation();
        infoService.setCharacteristic(Characteristic.Manufacturer, 'Nikita Platonov 2022')
        return [infoService, this.sensor];
    }

    handleMotionDetectedGet(callback) {
        let isOn = 32;
        let id = map.get(this.config.name);

        setInterval(() => {
            axios({
                method: 'get',
                url: 'http://' + this.ip + ':60000/v1.3/smarthome/devices?dev_id=' + id,
                headers: {
                    Authorization: 'Token aGksbWF4ISBrYWsgZGVsYT8=',
                }
            })
                .then(res => {
                    isOn = res.data[0].zcluster.filter(zcl => {
                        if (zcl.zcl_id === 1280) {
                            isOn = zcl.attributes[2].str_attr_value;
                            this.sensor.getCharacteristic(Characteristic.MotionDetected).updateValue(isOn == 33);
                        }
                    })
                });
        }, 1000);
        callback(null, isOn);
    }
}

class MotionSensorGSLabs {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.api = api;
        this.ip = config.ip;

        addToMap(this.config, this.ip);

        this.sensor = new Service.MotionSensor(this.config.name);

        this.sensor.getCharacteristic(Characteristic.MotionDetected)
            .on("get", this.handleMotionDetectedGet.bind(this));

    }

    getServices() {
        if (!this.sensor) return [];
        const infoService = new Service.AccessoryInformation();
        infoService.setCharacteristic(Characteristic.Manufacturer, 'Nikita Platonov 2022')
        return [infoService, this.sensor];
    }

    handleMotionDetectedGet(callback) {
        let isOn = 32;
        let id = map.get(this.config.name);

        setInterval(() => {
            axios({
                method: 'get',
                url: 'http://' + this.ip + ':60000/v1.3/smarthome/devices?dev_id=' + id,
                headers: {
                    Authorization: 'Token aGksbWF4ISBrYWsgZGVsYT8=',
                }
            })
                .then(res => {
                    isOn = res.data[0].zcluster.filter(zcl => {
                        if (zcl.zcl_id === 1280) {
                            isOn = zcl.attributes[2].str_attr_value;
                            this.sensor.getCharacteristic(Characteristic.MotionDetected).updateValue(isOn == 33);
                        }
                    })
                });
        }, 1000);
        callback(null, isOn);
    }
}