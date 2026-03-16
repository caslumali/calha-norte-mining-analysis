/*
 * Calha Norte Mining Analysis - Sentinel-2 Explorer
 *
 * Purpose:
 * Interactive Earth Engine app for filtering Sentinel-2 scenes, switching
 * between visualizations, overlaying mining-related layers, and exporting
 * selected imagery for cartographic interpretation.
 *
 * Notes:
 * - This public script depends on private Earth Engine assets referenced below.
 * - It is intended as a working image-inspection tool, not a full analysis
 *   pipeline.
 */

var app = {};

app.optionalLayerCheckboxes = {};
app.optionalLayerRefs = {};
app.imageLayer = null;
app.sceneMetadataById = {};

app.assets = {
  'Calha Norte mining sites': ee.FeatureCollection('projects/amazon-mining-analysis/assets/garimpo-cn/garimpos_cn'),
  'Mining zones': ee.FeatureCollection('projects/amazon-mining-analysis/assets/garimpo-cn/zones_garimpo_cn'),
  'Hydrography': ee.FeatureCollection('projects/amazon-mining-analysis/assets/garimpo-cn/hid_1000_cn')
};

app.assetStyles = {
  'Calha Norte mining sites': {color: 'yellow', pointSize: 5, pointShape: 'circle', width: 1},
  'Mining zones': {color: 'red', fillColor: 'ffffff', width: 2},
  'Hydrography': {color: 'blue', width: 1}
};

app.createConstants = function() {
  // Shared constants and visualization presets for quick Sentinel-2 inspection.
  app.collectionId = 'COPERNICUS/S2_SR_HARMONIZED';
  app.imageCountLimit = 30;
  app.scaleFactor = 1e-4;
  app.offset = 0;
  app.sectionStyle = {margin: '20px 0 0 0'};
  app.helpTextStyle = {margin: '8px 0 -3px 8px', fontSize: '12px', color: 'gray'};
  app.ndviPalette = [
    'FFFFFF', 'CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718',
    '74A901', '66A000', '529400', '3E8601', '207401', '056201',
    '004C00', '023B01', '012E01', '011D01', '011301'
  ];
  app.visOptions = {
    'Natural color with NIR': {
      description: 'Near-natural rendering that helps highlight disturbed surfaces.',
      visParams: {gamma: 1.0, min: [283, 490, 513], max: [1685, 4468, 1800], bands: ['B4', 'B8', 'B3']}
    },
    'Natural color with stretched NIR': {
      description: 'Stretched rendering to emphasize forest disturbance and mining features.',
      visParams: {gamma: 1.0, min: [221, 838, 418], max: [845, 4758, 1070], bands: ['B4', 'B8', 'B3']}
    },
    'False color': {
      description: 'Vegetation appears in red tones and exposed areas become more visible.',
      visParams: {gamma: 1.0, min: 500, max: 7000, bands: ['B5', 'B4', 'B3']}
    },
    'Natural color': {
      description: 'True-color composite for general visual inspection.',
      visParams: {gamma: 1.3, min: 500, max: 7000, bands: ['B4', 'B3', 'B2']}
    },
    'Color infrared': {
      description: 'Infrared composite for vegetation and disturbance interpretation.',
      visParams: {gamma: 1.3, min: 500, max: 7000, bands: ['B8', 'B4', 'B3']}
    },
    'Agriculture / moisture': {
      description: 'Useful for contrasting vegetation vigor, moisture, and altered surfaces.',
      visParams: {gamma: 1.3, min: 500, max: 7000, bands: ['B11', 'B8A', 'B2']}
    },
    'SWIR': {
      description: 'Useful for highlighting moisture differences and exposed soils.',
      visParams: {gamma: 1.3, min: 500, max: 7000, bands: ['B12', 'B8', 'B4']}
    },
    'NDVI': {
      description: 'Normalized Difference Vegetation Index.',
      visParams: {min: 0, max: 0.7, palette: app.ndviPalette, bands: ['nd']}
    }
  };
};

app.applyScaleAndOffset = function(image) {
  // Sentinel-2 surface reflectance values are rescaled for display/export.
  return image.multiply(app.scaleFactor).add(app.offset);
};

app.addNdviBand = function(image) {
  var ndvi = image.normalizedDifference(['B8', 'B4']).rename('nd');
  return image.addBands(ndvi);
};

app.createPanels = function() {
  app.intro = {
    panel: ui.Panel([
      ui.Label({
        value: 'Sentinel-2 Explorer',
        style: {fontWeight: 'bold', fontSize: '24px', margin: '10px 5px'}
      }),
      ui.Label(
        'Filter Sentinel-2 scenes by date, inspect them with multiple visualizations, ' +
        'overlay mining-related layers, and export selected imagery.'
      )
    ])
  };

  app.filters = {
    mapCenter: ui.Checkbox({label: 'Filter around the current map center', value: true}),
    startDate: ui.Textbox('YYYY-MM-DD', '2016-08-01'),
    endDate: ui.Textbox('YYYY-MM-DD', '2016-12-31'),
    maxCloudCover: ui.Textbox('0-100', '30'),
    applyButton: ui.Button('Apply filters', app.applyFilters),
    statusLabel: ui.Label({
      value: '',
      style: {margin: '8px 0 0 0', fontSize: '12px', color: 'gray', shown: false}
    }),
    loadingLabel: ui.Label({
      value: 'Loading...',
      style: {stretch: 'vertical', color: 'gray', shown: false}
    })
  };

  app.filters.panel = ui.Panel({
    widgets: [
      ui.Label('1) Filter by date', {fontWeight: 'bold'}),
      ui.Label('Start date', app.helpTextStyle), app.filters.startDate,
      ui.Label('End date', app.helpTextStyle), app.filters.endDate,
      ui.Label('Max cloud cover (%)', app.helpTextStyle), app.filters.maxCloudCover,
      app.filters.mapCenter,
      ui.Panel(
        [app.filters.applyButton, app.filters.loadingLabel],
        ui.Panel.Layout.flow('horizontal')
      ),
      app.filters.statusLabel
    ],
    style: app.sectionStyle
  });

  app.picker = {
    select: ui.Select({
      placeholder: 'Select an image ID',
      onChange: app.refreshMapLayer
    }),
    infoLabel: ui.Label({
      value: '',
      style: {margin: '6px 0 0 0', fontSize: '12px', color: 'gray', shown: false}
    }),
    centerButton: ui.Button('Center on image', function() {
      if (app.imageLayer) {
        Map.centerObject(app.imageLayer.get('eeObject'));
      }
    })
  };

  app.picker.panel = ui.Panel({
    widgets: [
      ui.Label('2) Select an image', {fontWeight: 'bold'}),
      ui.Panel([app.picker.select, app.picker.centerButton], ui.Panel.Layout.flow('horizontal')),
      app.picker.infoLabel
    ],
    style: app.sectionStyle
  });

  app.vis = {
    label: ui.Label(),
    select: ui.Select({
      items: Object.keys(app.visOptions),
      onChange: function() {
        var option = app.visOptions[app.vis.select.getValue()];
        app.vis.label.setValue(option.description);
        app.refreshMapLayer();
      }
    }),
    minSlider: ui.Slider({
      min: 0, max: 1, value: 0, step: 0.01,
      onChange: app.refreshMapLayer,
      style: {width: '200px'}
    }),
    maxSlider: ui.Slider({
      min: 0, max: 1, value: 0.98, step: 0.01,
      onChange: app.refreshMapLayer,
      style: {width: '200px'}
    })
  };

  app.vis.panel = ui.Panel({
    widgets: [
      ui.Label('3) Select a visualization', {fontWeight: 'bold'}),
      app.vis.select,
      app.vis.label,
      ui.Label('Min stretch'), app.vis.minSlider,
      ui.Label('Max stretch'), app.vis.maxSlider
    ],
    style: app.sectionStyle
  });

  app.vis.select.setValue(Object.keys(app.visOptions)[0]);
  app.vis.label.setValue(app.visOptions[app.vis.select.getValue()].description);

  app.optionalLayersPanel = ui.Panel({
    widgets: [
      ui.Label('4) Optional layers', {fontWeight: 'bold'})
    ]
  });

  Object.keys(app.assets).forEach(function(layerName) {
    // Optional contextual layers can be toggled during visual inspection.
    var checkbox = ui.Checkbox({
      label: layerName,
      onChange: function(checked) {
        app.updateOptionalLayer(layerName, checked);
      }
    });
    app.optionalLayersPanel.add(checkbox);
    app.optionalLayerCheckboxes[layerName] = checkbox;
  });

  app.export = {
    button: ui.Button({
      label: 'Export current image to Drive',
      onClick: function() {
        var selected = app.picker.select.getValue();
        if (!selected) {
          ui.alert('Select an image before exporting.');
          return;
        }

        var imageIdSuffix = selected.split(' ')[0];
        var imageId = app.collectionId + '/' + imageIdSuffix;
        var visOption = app.visOptions[app.vis.select.getValue()];
        var image = app.applyScaleAndOffset(ee.Image(imageId));

        if (app.vis.select.getValue() === 'NDVI') {
          image = app.addNdviBand(image);
        }

        Export.image.toDrive({
          image: image.select(visOption.visParams.bands),
          description: 'sentinel2_export_' + imageIdSuffix,
          maxPixels: 1e9
        });
      }
    })
  };

  app.export.panel = ui.Panel({
    widgets: [
      ui.Label('5) Export', {fontWeight: 'bold'}),
      app.export.button
    ],
    style: app.sectionStyle
  });
};

app.createHelpers = function() {
  app.setStatus = function(message, color) {
    app.filters.statusLabel.setValue(message || '');
    app.filters.statusLabel.style().set('color', color || 'gray');
    app.filters.statusLabel.style().set('shown', !!message);
  };

  app.clearImageSelection = function() {
    app.sceneMetadataById = {};
    app.picker.select.items().reset([]);
    app.picker.select.setPlaceholder('No image available');
    app.picker.infoLabel.setValue('');
    app.picker.infoLabel.style().set('shown', false);

    if (app.imageLayer) {
      Map.layers().remove(app.imageLayer);
      app.imageLayer = null;
    }
  };

  app.parseDateInput = function(value, label) {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(label + ' must use the YYYY-MM-DD format.');
    }

    var parsed = new Date(value + 'T00:00:00');
    if (isNaN(parsed.getTime())) {
      throw new Error(label + ' is not a valid date.');
    }

    return parsed;
  };

  app.parsePercentageInput = function(value, label) {
    if (!value || !/^\d+(\.\d+)?$/.test(value)) {
      throw new Error(label + ' must be a number between 0 and 100.');
    }

    var parsed = Number(value);
    if (parsed < 0 || parsed > 100) {
      throw new Error(label + ' must be between 0 and 100.');
    }

    return parsed;
  };

  app.formatDate = function(value) {
    var date = new Date(value);
    return date.toISOString().slice(0, 10);
  };

  app.updateSceneInfo = function(imageIdSuffix) {
    var metadata = app.sceneMetadataById[imageIdSuffix];
    if (!metadata) {
      app.picker.infoLabel.setValue('');
      app.picker.infoLabel.style().set('shown', false);
      return;
    }

    app.picker.infoLabel.setValue(
      'Sentinel-2 | ' + metadata.date + ' | ' + metadata.cloudiness.toFixed(2) + '% clouds'
    );
    app.picker.infoLabel.style().set('shown', true);
  };

  app.setLoadingMode = function(enabled) {
    app.filters.loadingLabel.style().set('shown', enabled);

    [
      app.vis.select,
      app.filters.startDate,
      app.filters.endDate,
      app.filters.maxCloudCover,
      app.filters.applyButton,
      app.filters.mapCenter,
      app.picker.select,
      app.picker.centerButton,
      app.export.button
    ].forEach(function(widget) {
      widget.setDisabled(enabled);
    });
  };

  app.applyFilters = function() {
    var startValue = app.filters.startDate.getValue();
    var endValue = app.filters.endDate.getValue();
    var maxCloudValue = app.filters.maxCloudCover.getValue();
    var startDateJs;
    var endDateJs;
    var maxCloudCover;

    try {
      startDateJs = app.parseDateInput(startValue, 'Start date');
      endDateJs = app.parseDateInput(endValue, 'End date');
      maxCloudCover = app.parsePercentageInput(maxCloudValue, 'Max cloud cover');
    } catch (error) {
      app.setStatus(error.message, 'red');
      ui.alert(error.message);
      return;
    }

    if (startDateJs > endDateJs) {
      app.setStatus('Start date must be earlier than or equal to end date.', 'red');
      ui.alert('Start date must be earlier than or equal to end date.');
      return;
    }

    app.setStatus('');
    app.setLoadingMode(true);

    var filtered = ee.ImageCollection(app.collectionId);

    if (app.filters.mapCenter.getValue()) {
      filtered = filtered.filterBounds(Map.getCenter());
    }

    filtered = filtered
      .filterDate(ee.Date(startValue), ee.Date(endValue))
      .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', maxCloudCover));

    filtered = filtered
      // Sort candidate scenes by cloudiness to surface the cleanest options first.
      .map(function(image) {
        return image.set('cloudiness', ee.Number(image.get('CLOUD_COVERAGE_ASSESSMENT')));
      })
      .sort('cloudiness')
      .limit(app.imageCountLimit);

    filtered
      .aggregate_array('system:index')
      .zip(filtered.aggregate_array('cloudiness'))
      .zip(filtered.aggregate_array('system:time_start'))
      .evaluate(function(items) {
        if (!items || items.length === 0) {
          app.setLoadingMode(false);
          app.clearImageSelection();
          app.setStatus('No Sentinel-2 images were found for the selected filters.', 'red');
          return;
        }

        app.sceneMetadataById = {};

        var ids = items.map(function(item) {
          var imageId = item[0][0];
          var cloudiness = item[0][1];
          var timeStart = item[1];

          app.sceneMetadataById[imageId] = {
            cloudiness: cloudiness,
            date: app.formatDate(timeStart)
          };

          return imageId + ' (' + cloudiness.toFixed(2) + '% clouds)';
        });

        app.setLoadingMode(false);
        app.setStatus('Loaded ' + ids.length + ' candidate Sentinel-2 scenes.', 'gray');
        app.picker.select.items().reset(ids);
        app.picker.select.setPlaceholder('Select an image ID');

        if (ids.length > 0) {
          app.picker.select.setValue(ids[0]);
        }
      });
  };

  app.refreshMapLayer = function() {
    var selected = app.picker.select.getValue();
    if (!selected) return;

    // Rebuild the displayed image when the selected scene or visualization changes.
    var imageIdSuffix = selected.split(' ')[0];
    app.updateSceneInfo(imageIdSuffix);
    var image = app.applyScaleAndOffset(ee.Image(app.collectionId + '/' + imageIdSuffix));
    var visOption = app.visOptions[app.vis.select.getValue()];

    if (app.vis.select.getValue() === 'NDVI') {
      image = app.addNdviBand(image);
    }

    if (app.imageLayer) {
      Map.layers().remove(app.imageLayer);
    }

    app.imageLayer = ui.Map.Layer(image, {
      bands: visOption.visParams.bands,
      palette: visOption.visParams.palette,
      gamma: visOption.visParams.gamma,
      opacity: visOption.visParams.opacity,
      min: app.vis.minSlider.getValue(),
      max: app.vis.maxSlider.getValue()
    }, 'Image layer');

    Map.layers().insert(0, app.imageLayer);
  };
};

app.updateOptionalLayer = function(layerName, visible) {
  if (app.optionalLayerRefs[layerName]) {
    Map.layers().remove(app.optionalLayerRefs[layerName]);
    app.optionalLayerRefs[layerName] = null;
  }

  if (visible) {
    var layer = ui.Map.Layer(app.assets[layerName], app.assetStyles[layerName] || {}, layerName);
    Map.layers().add(layer);
    app.optionalLayerRefs[layerName] = layer;
  }
};

app.boot = function() {
  app.createConstants();
  app.createHelpers();
  app.createPanels();

  var mainPanel = ui.Panel({
    widgets: [
      app.intro.panel,
      app.filters.panel,
      app.picker.panel,
      app.vis.panel,
      app.optionalLayersPanel,
      app.export.panel
    ],
    style: {width: '340px', padding: '8px'}
  });

  Map.setCenter(-55.5, 0.1, 7);
  ui.root.insert(0, mainPanel);

  app.applyFilters();
};

app.boot();
