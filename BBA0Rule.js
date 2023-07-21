/*global dashjs*/


let CustomBBA0Rule;

function CustomBBA0RuleClass() {

    let factory = dashjs.FactoryMaker;
    let SwitchRequest = factory.getClassFactoryByName('SwitchRequest');
    let DashMetrics = factory.getSingletonFactoryByName('DashMetrics');
    let Debug = factory.getSingletonFactoryByName('Debug');

    let context = this.context;
    let instance,
        logger;
    
    const reservoir = 5;
    const cushion = 10;
    let ratePrev = 0;

    function setup() {

        logger = Debug(context).getInstance().getLogger(instance);
    }

    function getMaxIndex(rulesContext) {
        let mediaInfo = rulesContext.getMediaInfo();
        let mediaType = mediaInfo.type;
        if (mediaType != "video") {
            return SwitchRequest(context).create(0);
        }

        let abrController = rulesContext.getAbrController();
        let dashMetrics = DashMetrics(context).getInstance();

        let rateMap = {};

        let bitrateList = abrController.getBitrateList(mediaInfo)
                            .map(function(bitrateInfo){
                                return bitrateInfo.bitrate;
                            });
        let bitrateCnt = bitrateList.length;

        let step = cushion / (bitrateCnt - 1);
        for (let i = 0; i < bitrateCnt; i++) {
            rateMap[reservoir + i * step] = bitrateList[i];
        }

        let rateMin = bitrateList[0];
        let rateMax = bitrateList[bitrateCnt - 1];
        ratePrev = ratePrev > rateMin ? ratePrev : rateMin;
        let ratePlus = rateMax;
        let rateMinus = rateMin;

        if (ratePrev === rateMax) {
            ratePlus = rateMax;
        } else {
            for (let i = 0; i < bitrateCnt; i++) {
                if (bitrateList[i] > ratePrev) {
                    ratePlus = bitrateList[i];
                    break;
                }
            }
        }

        if (ratePrev === rateMin) {
            rateMinus = rateMin;
        } else {
            for (let i = bitrateCnt - 1; i >= 0; i--) {
                if (bitrateList[i] < ratePrev) {
                    rateMinus = bitrateList[i];
                    break;
                }
            }
        }

        let currentBufferLevel = dashMetrics.getCurrentBufferLevel(mediaType, true);

        let func = function(bufferLevel) {
            if (bufferLevel < reservoir) {
                return rateMap[cushion + reservoir];
            } else if (bufferLevel > cushion + reservoir) {
                return rateMap[reservoir];
            } else {
                let index = Math.round((bufferLevel - reservoir) / step) *step + reservoir;
                return rateMap[index];
            }
        };

        let fBufferLevel = func(currentBufferLevel);
        
        let rateNext;
        if(currentBufferLevel <= reservoir) {
            rateNext = rateMin;
        } else if (currentBufferLevel >= cushion + reservoir) {
            rateNext = rateMax;
        } else if (fBufferLevel >= ratePlus) {
            for (let i = bitrateCnt; i >= 0; i--) {
                if (bitrateList[i] <= fBufferLevel) {
                    rateNext = bitrateList[i];
                    break;
                }
            }
        } else if (fBufferLevel <= rateMinus) {
            for (let i = 0; i < bitrateCnt; i++) {
                if (bitrateList[i] > fBufferLevel) {
                    rateNext = bitrateList[i];
                    break;
                }
            }
        } else {
            rateNext = ratePrev;
        }

        let quality = 0;
        for (let i = 0; i < bitrateCnt; i++) {
            if (bitrateList[i] == rateNext) {
                quality = i;
                break;
            }
        }

        logger.info("[BBA0Rule] CurrentBufferLevel = " + currentBufferLevel);
        logger.info("[BBA0Rule] Bitrate list = " + bitrateList);
        logger.info("[BBA0Rule] Previous bitrate = " + ratePrev);
        logger.info("[BBA0Rule] Next bitrate = " + rateNext);
        logger.info("[BBA0Rule] Quality = " + quality);

        ratePrev = rateNext;

        return SwitchRequest(context).create(
            quality,
            { name: CustomBBA0RuleClass.__dashjs_factory_name },
            SwitchRequest.PRIORITY.STRONG
        );
    }

    instance = {
        getMaxIndex: getMaxIndex
    };

    setup();

    return instance;
}

CustomBBA0RuleClass.__dashjs_factory_name = 'CustomBBA0Rule';
CustomBBA0Rule = dashjs.FactoryMaker.getClassFactory(CustomBBA0RuleClass);

